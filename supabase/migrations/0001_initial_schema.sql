-- =====================================================
-- DCbookspace 초기 스키마
-- 교회 장소사용신청 시스템
-- =====================================================

-- 확장
create extension if not exists "uuid-ossp";
create extension if not exists "btree_gist";

-- =====================================================
-- 건물 / 층 / 호실
-- =====================================================
create table buildings (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,                 -- 본당, 교육관
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table floors (
  id uuid primary key default uuid_generate_v4(),
  building_id uuid not null references buildings(id) on delete cascade,
  label text not null,                       -- 1F, 2F, B1
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (building_id, label)
);

create table rooms (
  id uuid primary key default uuid_generate_v4(),
  floor_id uuid not null references floors(id) on delete cascade,
  name text not null,                        -- 101호, 소예배실, 대예배실
  capacity int,
  -- 평면도 위에 박스로 그릴 때 좌표(0~100 비율)
  map_x numeric,
  map_y numeric,
  map_w numeric,
  map_h numeric,
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (floor_id, name)
);

-- =====================================================
-- 부서 / 사용자
-- =====================================================
create type user_role as enum (
  'applicant',      -- 일반 신청자
  'dept_head',      -- 부서장
  'elder',          -- 담당 장로
  'manager',        -- 관리집사
  'senior_pastor',  -- 당회장/담임목사
  'admin'           -- 시스템 관리자
);

create table departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,                 -- 청년부, 교육부, ...
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid unique,                       -- supabase auth.users.id
  name text not null,
  phone text,
  email text,
  role user_role not null default 'applicant',
  dept_id uuid references departments(id) on delete set null,
  -- 결재자만: PIN의 bcrypt 해시
  pin_hash text,
  pin_attempts int not null default 0,
  pin_locked_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 부서별 부서장 / 담당장로 매핑 (변경 가능)
alter table departments
  add column dept_head_id uuid references users(id) on delete set null,
  add column elder_id     uuid references users(id) on delete set null;

create index idx_users_role on users(role);
create index idx_users_dept on users(dept_id);

-- =====================================================
-- 결재선 템플릿
-- =====================================================
-- 기본 템플릿: 부서장 → 담당장로 → 관리집사  (3단계)
-- 특수 템플릿: 부서장 → 담당장로 → 관리집사 → 당회/담임목사 (4단계)
--   특수 조건: 참석 인원 >= 50명 또는 외부행사
create table approval_routes (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,                 -- "기본", "대규모/외부행사"
  -- 단계 정의: 각 단계가 어떤 role로 결재되어야 하는지
  -- 예: [{"order":1,"role":"dept_head"},{"order":2,"role":"elder"}, ...]
  steps jsonb not null,
  -- 자동 적용 조건 (jsonb)
  -- 예: {"min_attendees": 50} 또는 {"is_external": true}
  conditions jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- 기본 템플릿 시드
insert into approval_routes (name, steps, conditions, is_default) values
  (
    '기본',
    '[{"order":1,"role":"dept_head","label":"담당부서장"},
      {"order":2,"role":"elder","label":"담당장로"},
      {"order":3,"role":"manager","label":"관리집사"}]'::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    '대규모/외부행사',
    '[{"order":1,"role":"dept_head","label":"담당부서장"},
      {"order":2,"role":"elder","label":"담당장로"},
      {"order":3,"role":"manager","label":"관리집사"},
      {"order":4,"role":"senior_pastor","label":"담임목사"}]'::jsonb,
    '{"min_attendees": 50, "or_is_external": true}'::jsonb,
    false
  );

-- =====================================================
-- 예약 / 결재
-- =====================================================
create type reservation_status as enum (
  'draft',
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create type approval_status as enum (
  'pending',
  'approved',
  'rejected',
  'skipped'
);

create table reservations (
  id uuid primary key default uuid_generate_v4(),
  -- 사람 읽을 수 있는 신청번호 (예: 25-0042)
  ref_no text unique,
  room_id uuid not null references rooms(id) on delete restrict,
  applicant_id uuid not null references users(id) on delete restrict,
  dept_id uuid references departments(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  purpose text not null,
  attendee_count int not null default 0,
  is_external boolean not null default false,
  notes text,
  status reservation_status not null default 'pending',
  route_id uuid not null references approval_routes(id),
  current_step int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- 같은 호실, 시간 겹침 방지 (취소·반려 제외)
create index idx_res_room_time on reservations(room_id, start_at, end_at)
  where status in ('pending','approved');

-- 충돌 검증 함수
create or replace function check_reservation_conflict()
returns trigger as $$
begin
  if exists (
    select 1 from reservations r
    where r.room_id = NEW.room_id
      and r.id != NEW.id
      and r.status in ('pending','approved')
      and tstzrange(r.start_at, r.end_at, '[)') &&
          tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) then
    raise exception '해당 시간에 이미 예약(또는 결재중)이 있습니다.'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_reservation_conflict
  before insert or update of room_id, start_at, end_at, status
  on reservations
  for each row
  when (NEW.status in ('pending','approved'))
  execute function check_reservation_conflict();

-- 자동 신청번호 부여
create sequence reservations_ref_seq start 1;

create or replace function assign_reservation_ref()
returns trigger as $$
begin
  if NEW.ref_no is null then
    NEW.ref_no := to_char(now(),'YY') || '-' || lpad(nextval('reservations_ref_seq')::text, 4, '0');
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_reservation_ref_no
  before insert on reservations
  for each row execute function assign_reservation_ref();

-- 결재 행
create table approvals (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  step_order int not null,
  role user_role not null,                      -- 그 단계에 필요한 역할
  approver_id uuid references users(id) on delete set null,  -- 누가 했는지(or 할 사람)
  status approval_status not null default 'pending',
  -- QR에 들어갈 일회용 토큰. 결재 완료 시 무효화
  signature_token text not null unique default replace(uuid_generate_v4()::text, '-', ''),
  signed_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  unique (reservation_id, step_order)
);

create index idx_approvals_token on approvals(signature_token);
create index idx_approvals_res on approvals(reservation_id);
create index idx_approvals_pending on approvals(status, role) where status = 'pending';

-- =====================================================
-- 결재 진행 / 완료 처리 (RPC)
-- =====================================================
-- PIN 검증은 애플리케이션(서버)에서 bcrypt 비교로 처리.
-- 이 함수는 검증된 approver_id를 받아 결재 단계를 전이시킨다.
create or replace function record_approval(
  p_token text,
  p_approver_id uuid,
  p_decision text,                  -- 'approve' or 'reject'
  p_comment text default null
) returns jsonb as $$
declare
  v_appr approvals;
  v_res reservations;
  v_total_steps int;
  v_route approval_routes;
begin
  select * into v_appr from approvals where signature_token = p_token;
  if not found then
    raise exception '잘못된 결재 토큰입니다.' using errcode='P0002';
  end if;
  if v_appr.status <> 'pending' then
    raise exception '이미 처리된 결재입니다.' using errcode='P0003';
  end if;

  select * into v_res from reservations where id = v_appr.reservation_id;
  if v_res.current_step <> v_appr.step_order then
    raise exception '아직 차례가 아닌 결재 단계입니다.' using errcode='P0004';
  end if;
  if v_res.status <> 'pending' then
    raise exception '진행중인 신청이 아닙니다.' using errcode='P0005';
  end if;

  -- 결재 행 업데이트
  update approvals
     set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         approver_id = p_approver_id,
         signed_at = now(),
         comment = p_comment
   where id = v_appr.id;

  -- 반려 시 reservation도 반려
  if p_decision <> 'approve' then
    update reservations set status='rejected', updated_at=now() where id = v_res.id;
    return jsonb_build_object('result','rejected','reservation_id',v_res.id);
  end if;

  -- 다음 단계로
  select * into v_route from approval_routes where id = v_res.route_id;
  v_total_steps := jsonb_array_length(v_route.steps);

  if v_res.current_step >= v_total_steps then
    update reservations set status='approved', updated_at=now() where id=v_res.id;
    return jsonb_build_object('result','approved','reservation_id',v_res.id);
  else
    update reservations set current_step = current_step + 1, updated_at=now() where id=v_res.id;
    return jsonb_build_object('result','step_advanced','reservation_id',v_res.id, 'next_step', v_res.current_step + 1);
  end if;
end;
$$ language plpgsql security definer;

-- =====================================================
-- updated_at 자동 갱신
-- =====================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();
create trigger trg_reservations_updated_at before update on reservations
  for each row execute function set_updated_at();

-- =====================================================
-- Realtime 활성화
-- =====================================================
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table approvals;
