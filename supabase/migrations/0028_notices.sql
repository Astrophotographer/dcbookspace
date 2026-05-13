-- 공지사항
-- 공개 페이지(/notices)에 노출되는 짧은 운영 안내. 작성·수정은 /admin/notices 에서만.

create table notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0 and char_length(title) <= 120),
  body text not null check (length(trim(body)) > 0 and char_length(body) <= 5000),
  pinned boolean not null default false,
  active boolean not null default true,
  display_order int not null default 0,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notices_public_order
  on notices(active, pinned desc, published_at desc);

create trigger trg_notices_updated_at
  before update on notices
  for each row execute function set_updated_at();

insert into notices (title, body, pinned)
values (
  '장소사용 신청 시스템 도입 안내',
  '기존 종이 신청 방식 그대로 유지하면서, 신청서가 사무실 프린터에서 자동으로 출력되도록 도와드립니다. 결재는 예전처럼 종이에 사인만 하시면 됩니다.',
  true
);

alter publication supabase_realtime add table notices;
