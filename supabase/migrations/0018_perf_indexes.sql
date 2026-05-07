-- =====================================================
-- 0018: 성능 인덱스 추가
--
-- 1) reservations(start_at, end_at) 부분 인덱스
--    홈 화면은 호실 조건 없이 시간 범위로만 reservations 조회 → 기존
--    `idx_res_room_time` (room_id 선두) 인덱스가 활용되지 않음.
--    pending/approved 만 대상이라 partial index 로 크기 최소화.
--
-- 2) reservation_series(created_at desc)
--    /reservations 목록이 created_at 내림차순으로 200건 limit. 인덱스 없으면
--    full sort. 양 적을 때는 무시 가능하지만 누적되면 갈수록 느려짐.
-- =====================================================

create index if not exists idx_res_time_pending
  on reservations (start_at, end_at)
  where status in ('pending','approved');

create index if not exists idx_series_created_desc
  on reservation_series (created_at desc);
