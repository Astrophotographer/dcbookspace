-- =====================================================
-- 0033: 서류 출력 완료 횟수 추적
--
-- print_status 가 completed 로 전환될 때마다 print_completed_count 를 1 증가.
-- 브라우저 인쇄 대화상자 자체의 실제 종이 출력 여부는 알 수 없으므로,
-- NAS 인쇄 에이전트나 관리자가 completed 로 보고한 횟수를 기준으로 삼는다.
-- =====================================================

alter table reservations
  add column if not exists print_completed_count int not null default 0
    check (print_completed_count >= 0);

alter table reservation_series
  add column if not exists print_completed_count int not null default 0
    check (print_completed_count >= 0);

update reservations
   set print_completed_count = 1
 where print_status = 'completed'
   and print_completed_count = 0;

update reservation_series
   set print_completed_count = 1
 where print_status = 'completed'
   and print_completed_count = 0;

create or replace function update_print_status_at()
returns trigger as $$
begin
  if NEW.print_status is distinct from OLD.print_status then
    NEW.print_status_at := now();

    if NEW.print_status = 'completed'
       and OLD.print_status is distinct from 'completed' then
      NEW.print_completed_count := coalesce(OLD.print_completed_count, 0) + 1;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;
