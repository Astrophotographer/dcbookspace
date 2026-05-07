-- =====================================================
-- 0015: 정기 예배(fixed_events) 재시드
--
-- 0014 는 옛 호실명(영아부실/예배실/본당)으로 lookup 해서 모든 row 가 NOTICE skip 됐고,
-- fixed_events 테이블이 비어 있는 상태. 0013 에서 잡힌 새 호실명에 맞춰 다시 시드한다.
--
-- 매핑 정책
--   - 0014 의 12개 row 중 10개는 새 구조와 매핑 가능 → 시드
--   - 영아 1부/2부 (구: 교육관/2층/영아부실) 는 사이트에 영아부실이 없어 매핑 불가 → 보류
--     운영자가 위치 정해지면 별도 마이그레이션 또는 admin 페이지에서 추가
--
-- 멱등성: 같은 (name, room_id, weekday, start_time) 이미 있으면 skip.
-- 0014 와 동일한 lookup-by-name 패턴을 유지해서 호실 id 가 환경별로 달라도 동작.
-- =====================================================

do $$
declare
  ev record;
  v_room_id uuid;
begin
  for ev in
    select * from (values
      -- 유치 (교육관 5층 유치부 예배실)
      ('유치 1부',           '교육관',   '5층', '유치부 예배실',                0::smallint, '10:00'::time, '12:00'::time),
      ('유치 2부',           '교육관',   '5층', '유치부 예배실',                0,           '12:00',       '14:00'),

      -- 유년 (교육관 4층 유년부 예배실)
      ('유년 1부',           '교육관',   '4층', '유년부 예배실',                0,           '10:00',       '12:00'),
      ('유년 2부',           '교육관',   '4층', '유년부 예배실',                0,           '12:00',       '14:00'),

      -- 초등 (교회본관 3층 비전홀)  — 0013 에서 본당 → 교회본관
      ('초등 1부',           '교회본관', '3층', '비전홀',                       0,           '10:00',       '12:00'),
      ('초등 2부',           '교회본관', '3층', '비전홀',                       0,           '12:00',       '14:00'),

      -- 중등부 (교육관 B1 예배실(중등부))
      ('중등부',             '교육관',   'B1',  '예배실(중등부)',               0,           '10:00',       '12:00'),

      -- 고등부 (교육관 B2 제1예배실(고등부))
      ('고등부',             '교육관',   'B2',  '제1예배실(고등부)',            0,           '10:00',       '12:00'),

      -- AWANA (교육관 5층 영어초중등부(어와나) 예배실) — 토요일
      ('영어초중등부(AWANA)', '교육관',   '5층', '영어초중등부(어와나) 예배실',  6,           '10:00',       '12:00'),

      -- 주일 오후 연합 (교육관 5층 주일학교연합예배실)
      ('주교오후연합예배',    '교육관',   '5층', '주일학교연합예배실',           0,           '14:00',       '16:00')
    ) as t(name, building, floor_label, room_name, weekday, start_time, end_time)
  loop
    select r.id into v_room_id
      from rooms r
      join floors f    on f.id = r.floor_id
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
