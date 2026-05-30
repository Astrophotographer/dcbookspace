-- 0035: 담당장로 범위 목록/사인관리 쿼리 최적화

-- 신규 담당장로는 휴대폰을 숫자만 저장하므로, 같은 이름+전화번호 장로 조회의
-- 일반 경로가 expression fallback 없이 바로 끝나도록 보조 인덱스를 둔다.
create index if not exists idx_users_active_elder_name_phone_exact
  on users (name, phone)
  where role = 'elder'
    and active = true
    and phone is not null;

-- 담당장로 로그인 시 맡은 leaf 부서 목록을 먼저 구한 뒤 그 부서들로 신청서 쿼리를 제한한다.
create index if not exists idx_departments_elder_leaf_order
  on departments (elder_id, display_order)
  where parent_id is not null
    and elder_id is not null;

-- /admin/reservations: 담당장로의 담당부서 신청서/시리즈만 최신순으로 가져온다.
create index if not exists idx_reservations_dept_admin_list
  on reservations (dept_id, created_at desc)
  where series_id is null;

create index if not exists idx_series_dept_created_desc
  on reservation_series (dept_id, created_at desc);

-- /admin/signs: 담당부서의 오늘 이후 pending 신청서만 결재 대기 목록에 노출한다.
create index if not exists idx_reservations_dept_pending_signs
  on reservations (dept_id, end_at, start_at)
  where status = 'pending'
    and series_id is null;

create index if not exists idx_series_dept_pending_signs
  on reservation_series (dept_id, end_date, start_date)
  where status = 'pending';
