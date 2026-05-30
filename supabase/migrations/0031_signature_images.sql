-- =====================================================
-- 0031: 부서 사인 이미지와 신청서 사인 스냅샷
--
-- - departments: 부서장/담당장로 사인 이미지를 data URL 로 저장
-- - reservations: 신청서에 사인을 적용한 시점의 이미지를 snapshot 으로 보존
--   (이후 부서 사인이 바뀌어도 이미 저장된 신청서 출력물은 유지)
-- =====================================================

alter table departments
  add column dept_head_signature_data_url text,
  add column dept_head_signature_updated_at timestamptz,
  add column elder_signature_data_url text,
  add column elder_signature_updated_at timestamptz;

alter table reservations
  add column signature_snapshot jsonb,
  add column signature_snapshot_at timestamptz,
  add column signature_snapshot_by uuid references users(id) on delete set null;

create index idx_reservations_signature_snapshot_at
  on reservations(signature_snapshot_at)
  where signature_snapshot_at is not null;
