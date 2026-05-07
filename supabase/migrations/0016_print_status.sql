-- =====================================================
-- 프린트 상태 추적
--
-- 신청서가 접수되면 사무실 프린터로 인쇄 요청이 나가는 흐름.
-- 실제 프린터 연동은 추후 — 일단 상태값과 갱신 시각만 두고 UI 에서
-- 진행 표시·30초 타임아웃 감지에 사용.
--
-- 상태 흐름: requested → printing → completed
--          (requested 30초 초과 시) → failed
-- =====================================================

alter table reservations
  add column if not exists print_status text not null default 'requested'
    check (print_status in ('requested','printing','completed','failed')),
  add column if not exists print_status_at timestamptz not null default now();

alter table reservation_series
  add column if not exists print_status text not null default 'requested'
    check (print_status in ('requested','printing','completed','failed')),
  add column if not exists print_status_at timestamptz not null default now();

-- 트리거: print_status 가 바뀔 때 print_status_at 도 자동 갱신
create or replace function update_print_status_at()
returns trigger as $$
begin
  if NEW.print_status is distinct from OLD.print_status then
    NEW.print_status_at := now();
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_reservations_print_status_at on reservations;
create trigger trg_reservations_print_status_at
  before update on reservations
  for each row execute function update_print_status_at();

drop trigger if exists trg_series_print_status_at on reservation_series;
create trigger trg_series_print_status_at
  before update on reservation_series
  for each row execute function update_print_status_at();
