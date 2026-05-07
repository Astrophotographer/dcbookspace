-- =====================================================
-- 정기(매주) 신청 시리즈
--
-- 한 번 결재로 모든 회차가 같이 확정되는 흐름을 위해 reservation_series
-- 라는 부모 레코드를 도입한다. 각 회차는 기존 reservations 행에 series_id 만
-- 달린 형태이고, 결재 흐름은 series 단위로 한 번만 진행된다.
--
-- 충돌 검사 트리거(check_reservation_conflict)는 그대로 유지 — 회차마다
-- 실제 reservations 행이 만들어지므로 자동으로 적용됨.
-- =====================================================

-- 시리즈 ref_no 시퀀스 (일회성 신청과 분리)
create sequence if not exists reservation_series_ref_seq start 1;

create table reservation_series (
  id uuid primary key default gen_random_uuid(),
  ref_no text unique,                                     -- 'S' || YY || '-' || NNNN
  qr_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  applicant_id uuid not null references users(id) on delete restrict,
  dept_id uuid references departments(id) on delete set null,
  room_id uuid not null references rooms(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  start_date date not null,
  end_date date not null,
  -- [{"start":"14:00","end":"16:00"}, ...] (1개 이상). KST.
  time_blocks jsonb not null,
  purpose text not null,
  attendee_count int not null default 0,
  is_external boolean not null default false,
  notes text,
  status reservation_status not null default 'pending',
  route_id uuid not null references approval_routes(id),
  current_step int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (jsonb_typeof(time_blocks) = 'array' and jsonb_array_length(time_blocks) >= 1)
);

create index idx_series_applicant on reservation_series(applicant_id);
create index idx_series_room      on reservation_series(room_id);
create index idx_series_status    on reservation_series(status);

create trigger trg_series_updated_at before update on reservation_series
  for each row execute function set_updated_at();

-- 시리즈 신청번호 자동 부여 (S26-0001 형식)
create or replace function assign_series_ref()
returns trigger as $$
begin
  if NEW.ref_no is null then
    NEW.ref_no := 'S' || to_char(now(),'YY') || '-' || lpad(nextval('reservation_series_ref_seq')::text, 4, '0');
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_series_ref_no
  before insert on reservation_series
  for each row execute function assign_series_ref();

-- =====================================================
-- reservations 에 series_id 추가 — 회차 행을 시리즈에 묶음
-- =====================================================
alter table reservations
  add column if not exists series_id uuid references reservation_series(id) on delete cascade;

create index if not exists idx_reservations_series on reservations(series_id);

-- =====================================================
-- approvals 가 series 도 가리킬 수 있게
--   - reservation_id, series_id 둘 중 정확히 하나만 채워져야
-- =====================================================
alter table approvals
  add column if not exists series_id uuid references reservation_series(id) on delete cascade;

alter table approvals
  alter column reservation_id drop not null;

alter table approvals
  add constraint approvals_target_chk
    check (
      (reservation_id is not null and series_id is null) or
      (reservation_id is null and series_id is not null)
    );

create index if not exists idx_approvals_series on approvals(series_id);

-- =====================================================
-- 트리거: reservation_series.status 변경 → 모든 자식 reservations 동기화
--   approved/rejected/cancelled 일 때만 cascade. pending 으로 되돌아가는 케이스
--   (현재는 없음) 도 자식 status 를 pending 으로 맞춰주면 됨.
-- =====================================================
create or replace function sync_series_status_to_reservations()
returns trigger as $$
begin
  if NEW.status is distinct from OLD.status then
    update reservations
       set status = NEW.status,
           updated_at = now()
     where series_id = NEW.id;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_sync_series_status
  after update of status on reservation_series
  for each row execute function sync_series_status_to_reservations();

-- =====================================================
-- record_approval RPC 재정의 — 시리즈 결재도 처리
--   approval row 의 series_id 가 비어있지 않으면 reservation_series 를 진행시킨다.
-- =====================================================
create or replace function record_approval(
  p_token text,
  p_approver_id uuid,
  p_decision text,
  p_comment text default null
) returns jsonb as $$
declare
  v_appr approvals;
  v_res reservations;
  v_series reservation_series;
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

  -- 시리즈 결재 분기
  if v_appr.series_id is not null then
    select * into v_series from reservation_series where id = v_appr.series_id;
    if v_series.current_step <> v_appr.step_order then
      raise exception '아직 차례가 아닌 결재 단계입니다.' using errcode='P0004';
    end if;
    if v_series.status <> 'pending' then
      raise exception '진행중인 신청이 아닙니다.' using errcode='P0005';
    end if;

    update approvals
       set status = case when p_decision='approve' then 'approved' else 'rejected' end,
           approver_id = p_approver_id,
           signed_at = now(),
           comment = p_comment
     where id = v_appr.id;

    if p_decision <> 'approve' then
      update reservation_series set status='rejected', updated_at=now() where id = v_series.id;
      return jsonb_build_object('result','rejected','series_id',v_series.id);
    end if;

    select * into v_route from approval_routes where id = v_series.route_id;
    v_total_steps := jsonb_array_length(v_route.steps);

    if v_series.current_step >= v_total_steps then
      update reservation_series set status='approved', updated_at=now() where id=v_series.id;
      return jsonb_build_object('result','approved','series_id',v_series.id);
    else
      update reservation_series set current_step = current_step + 1, updated_at=now() where id=v_series.id;
      return jsonb_build_object('result','step_advanced','series_id',v_series.id, 'next_step', v_series.current_step + 1);
    end if;
  end if;

  -- 일회성 결재 (기존 흐름)
  select * into v_res from reservations where id = v_appr.reservation_id;
  if v_res.current_step <> v_appr.step_order then
    raise exception '아직 차례가 아닌 결재 단계입니다.' using errcode='P0004';
  end if;
  if v_res.status <> 'pending' then
    raise exception '진행중인 신청이 아닙니다.' using errcode='P0005';
  end if;

  update approvals
     set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         approver_id = p_approver_id,
         signed_at = now(),
         comment = p_comment
   where id = v_appr.id;

  if p_decision <> 'approve' then
    update reservations set status='rejected', updated_at=now() where id = v_res.id;
    return jsonb_build_object('result','rejected','reservation_id',v_res.id);
  end if;

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
-- Realtime publication
-- =====================================================
alter publication supabase_realtime add table reservation_series;
