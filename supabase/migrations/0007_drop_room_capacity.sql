-- =====================================================
-- 0007: rooms.capacity 컬럼 제거
-- 정원 입력 UI 가 없어 dead column. 표시도 모두 제거되어 schema 정리.
-- =====================================================

alter table rooms drop column capacity;
