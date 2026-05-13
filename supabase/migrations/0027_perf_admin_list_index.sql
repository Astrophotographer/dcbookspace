-- =====================================================
-- 0026: /admin/reservations 페이지 리스트 쿼리 최적화
--
-- 패턴: WHERE series_id IS NULL ORDER BY created_at DESC LIMIT 200
-- (시리즈에 속하지 않은 일회성 신청서 최신순)
--
-- 기존 idx_reservations_series 도 IS NULL 처리하지만, partial + DESC composite
-- 이 ORDER BY 까지 인덱스로 해결 → 정렬 비용 제거.
--
-- 효과 (church 규모): 현재 ms 미만, 누적 ~5000건 도달 시 가시적 (50ms+ → 5ms).
-- INSERT 비용 ↑ 미미 (partial 이라 series_id IS NOT NULL 행은 인덱스 안 들어감).
-- =====================================================

create index if not exists idx_reservations_admin_list
  on reservations (created_at desc)
  where series_id is null;
