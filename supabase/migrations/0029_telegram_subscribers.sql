-- =====================================================
-- 0029: 텔레그램 알림 자가 등록
--
-- - users (결재자/신청자) 와 분리된 별도 구독자 테이블. 알림만 받고 싶은
--   가족·부서기 등도 등록 가능.
-- - 이름/휴대폰/소속 부서를 받고, 알림 범위는 본인 부서 또는 모든 부서 중 선택.
-- - deep-link 자동 등록을 위한 1회성 토큰 테이블.
-- - 최종 수신자 조회 RPC: get_telegram_recipients(event_type, dept_id)
-- =====================================================

create table telegram_subscribers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  phone text not null check (phone ~ '^010\d{8}$'),
  -- 사용자가 연결한 봇 username. 운영은 보통 단일 봇이지만 기록용으로 보관.
  bot_username text not null check (bot_username ~ '^[A-Za-z0-9_]{5,32}$'),
  -- 알림 범위 표시용 라벨. 예: 모든 부서 / 유치1,2부
  scope_label text not null check (char_length(scope_label) between 1 and 60),
  -- 본인 소속 부서. 모든 부서 구독이어도 소속 확인용으로 보관.
  home_dept_id uuid references departments(id) on delete set null,
  -- 텔레그램 chat_id (개인 양수 / 그룹 -100... 음수)
  chat_id text not null check (chat_id ~ '^-?\d+$'),
  -- 과거 관리자 등록 여부를 기록. 범위 권한 제한에는 사용하지 않음.
  registered_by_admin boolean not null default false,
  watch_all boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 같은 사람이 같은 chat_id 로 두 번 등록 못 함.
  unique (phone, chat_id)
);
create index idx_telegram_subscribers_active
  on telegram_subscribers(active) where active;
create index idx_telegram_subscribers_home_dept
  on telegram_subscribers(home_dept_id);

create trigger trg_telegram_subscribers_updated_at
  before update on telegram_subscribers
  for each row execute function set_updated_at();

-- 구독할 부서. 현재 UI 는 본인 부서 1개 또는 모든 부서만 쓰지만, 확장 여지를 위해 다대다 유지.
create table telegram_subscriber_depts (
  subscriber_id uuid not null references telegram_subscribers(id) on delete cascade,
  dept_id uuid not null references departments(id) on delete cascade,
  primary key (subscriber_id, dept_id)
);

-- 구독할 이벤트 종류 (다대다). 비어있으면 알림 못 받음 (insert 시 default set 보장).
-- webhook.ts 의 WebhookEvent string 과 동일 값.
create table telegram_subscriber_events (
  subscriber_id uuid not null references telegram_subscribers(id) on delete cascade,
  event_type text not null check (event_type ~ '^(reservation|series)\.[a-z_]+$'),
  primary key (subscriber_id, event_type)
);

-- Deep-link 자동 등록용 1회성 토큰. 폼 입력 직후 발급, 10분 만료, 1회 사용.
create table telegram_link_tokens (
  token text primary key check (char_length(token) between 16 and 64),
  -- {name, phone, bot_username, scope_label, home_dept_id, watch_dept_ids[], event_types[], watch_all, registered_by_admin}
  subscriber_draft jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_chat_id text
);
create index idx_telegram_link_tokens_expires on telegram_link_tokens(expires_at);

-- =====================================================
-- RPC: 이벤트 + 부서 매칭 수신자 조회
--
-- 호출자(webhook.ts/buildRecipients) 가 매 이벤트마다 한 번씩 호출해서
-- recipients[] 채워 n8n 으로 보냄. n8n 은 each-loop 로 그대로 발송.
-- =====================================================
create or replace function get_telegram_recipients(
  p_event_type text,
  p_dept_id uuid
)
returns table (
  chat_id text,
  name text,
  dept_name text
)
language sql
stable
as $$
  select
    s.chat_id,
    s.name,
    coalesce(s.scope_label, d.name) as dept_name
  from telegram_subscribers s
  left join departments d on d.id = s.home_dept_id
  where s.active
    and exists (
      select 1 from telegram_subscriber_events e
       where e.subscriber_id = s.id
         and e.event_type = p_event_type
    )
    and (
      s.watch_all
      or exists (
        select 1 from telegram_subscriber_depts wd
         where wd.subscriber_id = s.id
           and wd.dept_id = p_dept_id
      )
      or (
        -- 부서 행이 비어있으면 home_dept_id 로 fallback
        not exists (
          select 1 from telegram_subscriber_depts wd
           where wd.subscriber_id = s.id
        )
        and s.home_dept_id = p_dept_id
      )
    );
$$;

revoke all on function get_telegram_recipients(text, uuid) from public;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'telegram_subscribers',
    'telegram_subscriber_depts',
    'telegram_subscriber_events',
    'telegram_link_tokens'
  ]) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
