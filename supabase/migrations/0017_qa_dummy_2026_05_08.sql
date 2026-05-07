-- =====================================================
-- 0016: QA 더미 데이터 — 2026-05-08, 교회본관 모든 호실
--
-- 목적: 신청내역/장소별 보기 등 UI QA 용 시드.
-- 특징:
--   * 모든 row 의 notes 에 '[QA-DUMMY-20260508]' 마커 → 나중에 한 번에 정리 가능
--   * 멱등: 같은 마커가 이미 있으면 skip
--   * 상태 분포: 결재 대기중 / 결재 진행중 / 예약완료 가 섞이게
--   * trigger 충돌 회피: force_overlap=true (이 시점에 같은 시간/호실 다른 신청이 있어도 통과)
--
-- 정리 (필요 시):
--   delete from reservations where notes = '[QA-DUMMY-20260508]';
-- =====================================================

do $$
declare
  v_applicant uuid;
  v_dept uuid;
  v_route uuid;
  v_route_steps jsonb;
  rec record;
  i int := 0;
  v_status reservation_status;
  v_current_step int;
  v_res_id uuid;
  v_step jsonb;
  v_step_order int;
  v_step_role user_role;
  v_appr_status approval_status;
  v_start timestamptz := '2026-05-08T10:00:00+09:00';
  v_end   timestamptz := '2026-05-08T12:00:00+09:00';
begin
  -- 1) 신청자: 'QA 더미' 가 있으면 재사용, 없으면 생성
  select id into v_applicant
    from users where name = 'QA 더미' and phone = '010-0000-0000' limit 1;
  if v_applicant is null then
    insert into users (name, phone, role)
    values ('QA 더미', '010-0000-0000', 'applicant')
    returning id into v_applicant;
  end if;

  -- 2) 부서: 첫 leaf (소분류) 하나 선택
  select id into v_dept
    from departments
    where parent_id is not null
    order by display_order, name
    limit 1;
  if v_dept is null then
    raise exception 'QA dummy seed: no leaf department found. Seed departments first.';
  end if;

  -- 3) 결재선: 기본
  select id, steps into v_route, v_route_steps
    from approval_routes where is_default = true limit 1;
  if v_route is null then
    select id, steps into v_route, v_route_steps
      from approval_routes order by created_at limit 1;
  end if;
  if v_route is null then
    raise exception 'QA dummy seed: no approval route found.';
  end if;

  -- 4) 교회본관 모든 활성 호실 순회
  for rec in
    select r.id, r.name
      from rooms r
      join floors f on f.id = r.floor_id
      join buildings b on b.id = f.building_id
     where b.name = '교회본관'
       and r.active = true
     order by f.display_order, r.display_order
  loop
    -- 같은 (호실, 시각, 마커) 이미 있으면 skip → 멱등
    if exists (
      select 1 from reservations
       where room_id = rec.id
         and start_at = v_start
         and notes = '[QA-DUMMY-20260508]'
    ) then
      raise notice 'Skip [%]: already seeded', rec.name;
      continue;
    end if;

    -- 상태 분포: 0~4(결재 대기중), 5~10(결재 진행중), 11+(예약완료)
    if i < 5 then
      v_status := 'pending';
      v_current_step := 1;
    elsif i < 11 then
      v_status := 'pending';
      v_current_step := 2;
    else
      v_status := 'approved';
      -- 모든 단계 통과 후를 표현하기 위해 마지막 단계+1
      v_current_step := jsonb_array_length(v_route_steps) + 1;
    end if;

    insert into reservations (
      room_id, applicant_id, dept_id,
      start_at, end_at,
      purpose, attendee_count, is_external, notes,
      status, route_id, current_step,
      force_overlap
    ) values (
      rec.id, v_applicant, v_dept,
      v_start, v_end,
      'QA 테스트 — ' || rec.name,
      10, false, '[QA-DUMMY-20260508]',
      v_status, v_route, v_current_step,
      true   -- 트리거 충돌 차단 우회
    ) returning id into v_res_id;

    -- approvals 행 생성. step_order < current_step 면 'approved', 그 외 'pending'.
    -- status='approved' 인 신청은 모든 단계가 'approved'.
    for v_step in select value from jsonb_array_elements(v_route_steps)
    loop
      v_step_order := (v_step->>'order')::int;
      v_step_role  := (v_step->>'role')::user_role;

      if v_status = 'approved' then
        v_appr_status := 'approved';
      elsif v_step_order < v_current_step then
        v_appr_status := 'approved';
      else
        v_appr_status := 'pending';
      end if;

      insert into approvals (
        reservation_id, step_order, role, status, signed_at
      ) values (
        v_res_id, v_step_order, v_step_role, v_appr_status,
        case when v_appr_status = 'approved' then now() else null end
      );
    end loop;

    i := i + 1;
  end loop;

  raise notice 'QA dummy seed: % rooms processed', i;
end$$;
