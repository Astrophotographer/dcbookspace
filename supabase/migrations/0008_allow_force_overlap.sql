-- =====================================================
-- 0008: 신청자가 명시적으로 동의한 경우 시간 중복 허용
--
-- 평소엔 trigger 가 우연한 중복(race) 차단을 그대로 유지하고,
-- 클라이언트에서 1차 경고 후 사용자가 "그래도 신청"을 누른 케이스만
-- force_overlap=true 로 INSERT → trigger 우회.
-- =====================================================

alter table reservations
  add column if not exists force_overlap boolean not null default false;

create or replace function check_reservation_conflict()
returns trigger as $$
begin
  -- 신청자가 사전 confirm 후 강제 진행한 경우 우회
  if NEW.force_overlap then
    return NEW;
  end if;

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
