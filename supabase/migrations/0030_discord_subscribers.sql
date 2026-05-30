-- =====================================================
-- 0030: 디스코드 알림 자가 등록
--
-- 텔레그램 알림 등록과 같은 구독 모델을 Discord 로 확장한다.
-- - DM(user id) 또는 채널(channel id) 대상 저장
-- - deep-link/외부 봇 자동 등록을 위한 1회성 토큰
-- - 최종 수신자 조회 RPC: get_discord_recipients(event_type, dept_id)
-- =====================================================

create table discord_subscribers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  phone text not null check (phone ~ '^010\d{8}$'),
  bot_username text not null check (char_length(bot_username) between 1 and 80),
  scope_label text not null check (char_length(scope_label) between 1 and 60),
  home_dept_id uuid references departments(id) on delete set null,
  target_type text not null check (target_type in ('dm', 'channel')),
  recipient_id text not null check (recipient_id ~ '^\d{15,25}$'),
  registered_by_admin boolean not null default false,
  watch_all boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone, target_type, recipient_id)
);

create index idx_discord_subscribers_active
  on discord_subscribers(active) where active;
create index idx_discord_subscribers_home_dept
  on discord_subscribers(home_dept_id);

create trigger trg_discord_subscribers_updated_at
  before update on discord_subscribers
  for each row execute function set_updated_at();

create table discord_subscriber_depts (
  subscriber_id uuid not null references discord_subscribers(id) on delete cascade,
  dept_id uuid not null references departments(id) on delete cascade,
  primary key (subscriber_id, dept_id)
);

create table discord_subscriber_events (
  subscriber_id uuid not null references discord_subscribers(id) on delete cascade,
  event_type text not null check (event_type ~ '^(reservation|series)\.[a-z_]+$'),
  primary key (subscriber_id, event_type)
);

create table discord_link_tokens (
  token text primary key check (char_length(token) between 16 and 64),
  subscriber_draft jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_target_type text check (used_target_type in ('dm', 'channel')),
  used_recipient_id text
);

create index idx_discord_link_tokens_expires on discord_link_tokens(expires_at);

create or replace function get_discord_recipients(
  p_event_type text,
  p_dept_id uuid
)
returns table (
  recipient_id text,
  target_type text,
  name text,
  dept_name text
)
language sql
stable
as $$
  select
    s.recipient_id,
    s.target_type,
    s.name,
    coalesce(s.scope_label, d.name) as dept_name
  from discord_subscribers s
  left join departments d on d.id = s.home_dept_id
  where s.active
    and exists (
      select 1 from discord_subscriber_events e
       where e.subscriber_id = s.id
         and e.event_type = p_event_type
    )
    and (
      s.watch_all
      or exists (
        select 1 from discord_subscriber_depts wd
         where wd.subscriber_id = s.id
           and wd.dept_id = p_dept_id
      )
      or (
        not exists (
          select 1 from discord_subscriber_depts wd
           where wd.subscriber_id = s.id
        )
        and s.home_dept_id = p_dept_id
      )
    );
$$;

revoke all on function get_discord_recipients(text, uuid) from public;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'discord_subscribers',
    'discord_subscriber_depts',
    'discord_subscriber_events',
    'discord_link_tokens'
  ]) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
