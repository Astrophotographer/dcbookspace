-- =====================================================
-- 데이터 보존 정책: 1년 → 아카이브 / 3년 → 폐기
-- =====================================================
-- 2026-05-12 정책 확정:
--   • 행사 종료(end_at) 후 1년이 지난 신청서 → archived_at 세팅 (UI 숨김 대상)
--   • 행사 종료 후 3년이 지난 신청서 → 영구 삭제 (approvals 도 cascade 로 함께 사라짐)
--
-- 이 마이그레이션은 *정책 인프라* 만 깔아둔다 — 1년치 데이터가 쌓이기 전엔
-- 실제로 archive 될 행이 없으므로 기존 UI 쿼리의 archived_at 필터링은 보류.
-- 첫 archive 실행 즈음(2027-05) 에 hot 쿼리들 (`.is('archived_at', null)`) 추가 예정.
--
-- 새 series 행은 잘 안 늘어나는 메타데이터(반복 신청당 1개) 라 archived 컬럼 X.
-- 자식 reservations 가 purge 되면 series 는 자연스럽게 row 만 남는데 영향 적음.

alter table reservations
  add column if not exists archived_at timestamptz;

-- 부분 인덱스 — archived_at IS NULL (hot) 쿼리 빠르게.
-- 추후 모든 hot 쿼리에 `where archived_at is null` 추가될 때 활용.
create index if not exists idx_res_archived_at_null
  on reservations(end_at)
  where archived_at is null;

-- ─────────────────────────────────────────────────────
-- pg_cron 스케줄
-- ─────────────────────────────────────────────────────
-- Supabase 는 extensions 스키마에 pg_cron 설치 가능.
-- 이미 설치돼 있으면 no-op.
create extension if not exists pg_cron with schema extensions;

-- 기존 동명 job 있으면 제거 후 재등록 — 마이그레이션 재실행 안전성.
do $$
begin
  perform cron.unschedule('retention-archive-old-reservations');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('retention-purge-very-old-reservations');
exception when others then null;
end $$;

-- 매월 1일 03:00 UTC (12:00 KST) — 1년 지난 종료 신청서를 archive 상태로
select cron.schedule(
  'retention-archive-old-reservations',
  '0 3 1 * *',
  $$
    update reservations
       set archived_at = now()
     where archived_at is null
       and end_at < now() - interval '1 year'
  $$
);

-- 매월 1일 04:00 UTC — 3년 지난 종료 신청서를 영구 삭제
-- approvals 는 cascade 로 함께 삭제됨 (FK on delete cascade).
-- 추후 orphan 된 reservation_series 정리는 별도 정책으로.
select cron.schedule(
  'retention-purge-very-old-reservations',
  '0 4 1 * *',
  $$
    delete from reservations
     where end_at < now() - interval '3 years'
  $$
);

-- ─────────────────────────────────────────────────────
-- 점검 쿼리 (참고용 — 직접 실행 안 됨, 주석 처리)
-- ─────────────────────────────────────────────────────
-- 현재 스케줄된 retention job 보기:
--   select jobid, schedule, command from cron.job where jobname like 'retention-%';
-- 최근 실행 이력:
--   select * from cron.job_run_details where jobname like 'retention-%' order by start_time desc limit 20;
-- archive 대상 미리보기 (지금 즉시 실행하면 몇 건이 archive 될까):
--   select count(*) from reservations where archived_at is null and end_at < now() - interval '1 year';
-- purge 대상 미리보기:
--   select count(*) from reservations where end_at < now() - interval '3 years';
