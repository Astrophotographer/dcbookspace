-- 고정 행사 (주일 예배·수요예배·새벽기도 같이 매주 반복되는 정규 일정)
-- 일반 신청과 별개 트랙: 결재 흐름 없음, 관리자만 등록·수정.
-- 캘린더와 충돌 검사에 가상으로 expansion 되어 표시된다.

create table fixed_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,                              -- 예: "주일 1부 예배"
  room_id uuid not null references rooms(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=일~6=토
  start_time time not null,
  end_time   time not null,
  effective_from date not null default current_date,
  effective_until date,                            -- null = 영구
  display_order int not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_until is null or effective_until >= effective_from)
);

create index idx_fixed_events_room_weekday
  on fixed_events(room_id, weekday)
  where active = true;

create trigger trg_fixed_events_updated_at
  before update on fixed_events
  for each row execute function set_updated_at();

-- Realtime: 다른 탭에서 등록·수정하면 캘린더 바로 반영
alter publication supabase_realtime add table fixed_events;
