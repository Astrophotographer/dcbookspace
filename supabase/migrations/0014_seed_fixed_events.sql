-- =====================================================
-- 고정 행사 시드 — 주일 부서별 예배 + 토요일 AWANA + 주교오후연합예배
--
-- (building.name, floor.label, room.name) 으로 lookup. 매칭 실패 시 NOTICE.
-- 같은 (이름, room, weekday, start_time) 조합이 이미 있으면 skip → 멱등.
-- 시작 시간 + 2시간 = 종료 시간 (요청 정책).
-- =====================================================

do $$
declare
  ev record;
  v_room_id uuid;
begin
  for ev in
    select * from (values
      -- 영아 (교육관 2층 영아부실)
      ('영아 1부',           '교육관', '2층', '영아부실', 0::smallint, '10:00'::time, '12:00'::time),
      ('영아 2부',           '교육관', '2층', '영아부실', 0,           '12:00',       '14:00'),

      -- 유치 (교육관 5층 유치부실)
      ('유치 1부',           '교육관', '5층', '유치부실', 0,           '10:00',       '12:00'),
      ('유치 2부',           '교육관', '5층', '유치부실', 0,           '12:00',       '14:00'),

      -- 유년 (교육관 4층 유년부실)
      ('유년 1부',           '교육관', '4층', '유년부실', 0,           '10:00',       '12:00'),
      ('유년 2부',           '교육관', '4층', '유년부실', 0,           '12:00',       '14:00'),

      -- 초등 (본당 3층 비전홀)
      ('초등 1부',           '본당',   '3층', '비전홀',   0,           '10:00',       '12:00'),
      ('초등 2부',           '본당',   '3층', '비전홀',   0,           '12:00',       '14:00'),

      -- 중·고등부 (교육관 지하 예배실)
      ('중등부',             '교육관', 'B1',  '예배실',   0,           '10:00',       '12:00'),
      ('고등부',             '교육관', 'B2',  '예배실',   0,           '10:00',       '12:00'),

      -- 토요일 AWANA / 주일 오후 연합 (교육관 5층 예배실)
      ('영어초중등부(AWANA)', '교육관', '5층', '예배실',   6,           '10:00',       '12:00'),
      ('주교오후연합예배',    '교육관', '5층', '예배실',   0,           '14:00',       '16:00')
    ) as t(name, building, floor_label, room_name, weekday, start_time, end_time)
  loop
    select r.id into v_room_id
      from rooms r
      join floors f on f.id = r.floor_id
      join buildings b on b.id = f.building_id
     where b.name = ev.building
       and f.label = ev.floor_label
       and r.name = ev.room_name
     limit 1;

    if v_room_id is null then
      raise notice 'Skip [%]: room not found (%, %, %)',
        ev.name, ev.building, ev.floor_label, ev.room_name;
      continue;
    end if;

    if exists (
      select 1 from fixed_events fe
       where fe.name = ev.name
         and fe.room_id = v_room_id
         and fe.weekday = ev.weekday
         and fe.start_time = ev.start_time
    ) then
      raise notice 'Skip [%]: already seeded', ev.name;
      continue;
    end if;

    insert into fixed_events
      (name, room_id, weekday, start_time, end_time, active)
    values
      (ev.name, v_room_id, ev.weekday, ev.start_time, ev.end_time, true);
  end loop;
end$$;
