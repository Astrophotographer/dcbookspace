-- =====================================================
-- 0023: 관리자 페이지 일괄 입력 (departments / rooms) 용 RPC
--
-- - PL/pgSQL 함수는 한 트랜잭션 안에서 실행되므로 중간 실패 시 자동 ROLLBACK.
-- - departments: { group, leaf?, head_name?, head_phone?, head_pin_hash?,
--                  elder_name?, elder_phone?, elder_pin_hash? }[] 받음.
--   * 그룹 재사용/신규, leaf 가 있으면 그 그룹 아래 생성.
--   * 부서장·담당장로는 leaf 가 있을 때만 처리.
--   * PIN 해시는 client(JS bcryptjs) 에서 미리 계산해 넘김 — pgcrypto bf 와 호환 불확실해서 회피.
-- - rooms: { building, floor, room }[] 받음. 건물·층 없으면 생성.
-- - 고정 행사·결재자는 단일 테이블 insert 한 번이라 client-side 로 처리.
-- =====================================================

-- 부서 일괄 등록 — 그룹 + leaf + 부서장 + 담당장로 한 트랜잭션
create or replace function bulk_insert_departments(items jsonb)
returns integer
language plpgsql
as $$
declare
  rec jsonb;
  v_group_id uuid;
  v_leaf_id uuid;
  v_group_name text;
  v_leaf_name text;
  v_head_name text;
  v_head_phone text;
  v_head_pin_hash text;
  v_elder_name text;
  v_elder_phone text;
  v_elder_pin_hash text;
  v_user_id uuid;
  v_order int;
  inserted_count int := 0;
begin
  for rec in select value from jsonb_array_elements(items)
  loop
    v_group_name := trim(rec->>'group');
    v_leaf_name := nullif(trim(coalesce(rec->>'leaf', '')), '');
    v_head_name := nullif(trim(coalesce(rec->>'head_name', '')), '');
    v_head_phone := nullif(trim(coalesce(rec->>'head_phone', '')), '');
    v_head_pin_hash := nullif(trim(coalesce(rec->>'head_pin_hash', '')), '');
    v_elder_name := nullif(trim(coalesce(rec->>'elder_name', '')), '');
    v_elder_phone := nullif(trim(coalesce(rec->>'elder_phone', '')), '');
    v_elder_pin_hash := nullif(trim(coalesce(rec->>'elder_pin_hash', '')), '');

    if v_group_name is null or v_group_name = '' then
      raise exception '대분류 이름이 비어있습니다.';
    end if;

    -- 그룹 재사용 or 신규
    select id into v_group_id
      from departments
     where parent_id is null and name = v_group_name
     limit 1;
    if v_group_id is null then
      select coalesce(max(display_order), -1) + 1 into v_order
        from departments where parent_id is null;
      insert into departments (name, parent_id, display_order)
        values (v_group_name, null, v_order)
        returning id into v_group_id;
      inserted_count := inserted_count + 1;
    end if;

    if v_leaf_name is not null then
      -- leaf 추가 (이미 존재하면 unique 충돌로 트랜잭션 전체 롤백)
      select coalesce(max(display_order), -1) + 1 into v_order
        from departments where parent_id = v_group_id;
      insert into departments (name, parent_id, display_order)
        values (v_leaf_name, v_group_id, v_order)
        returning id into v_leaf_id;
      inserted_count := inserted_count + 1;

      -- 부서장 — 이름·전화·해시가 모두 있을 때만
      if v_head_name is not null and v_head_phone is not null and v_head_pin_hash is not null then
        insert into users (name, phone, role, dept_id, pin_hash)
          values (v_head_name, v_head_phone, 'dept_head', v_leaf_id, v_head_pin_hash)
          returning id into v_user_id;
        update departments set dept_head_id = v_user_id where id = v_leaf_id;
      end if;

      -- 담당장로 — 동일하게 모두 있을 때만
      if v_elder_name is not null and v_elder_phone is not null and v_elder_pin_hash is not null then
        insert into users (name, phone, role, dept_id, pin_hash)
          values (v_elder_name, v_elder_phone, 'elder', v_leaf_id, v_elder_pin_hash)
          returning id into v_user_id;
        update departments set elder_id = v_user_id where id = v_leaf_id;
      end if;
    end if;
  end loop;

  return inserted_count;
end;
$$;

-- 건물·층·호실 일괄 등록 — 계층 신규 생성 포함
create or replace function bulk_insert_rooms(items jsonb)
returns integer
language plpgsql
as $$
declare
  rec jsonb;
  v_building_id uuid;
  v_building_name text;
  v_floor_id uuid;
  v_floor_label text;
  v_room_name text;
  v_order int;
  inserted_count int := 0;
begin
  for rec in select value from jsonb_array_elements(items)
  loop
    v_building_name := trim(rec->>'building');
    v_floor_label := trim(rec->>'floor');
    v_room_name := trim(rec->>'room');

    if v_building_name = '' or v_floor_label = '' or v_room_name = '' then
      raise exception '건물·층·호실은 모두 필수입니다.';
    end if;

    -- 건물 — 재사용 or 신규
    select id into v_building_id from buildings where name = v_building_name limit 1;
    if v_building_id is null then
      select coalesce(max(display_order), -1) + 1 into v_order from buildings;
      insert into buildings (name, display_order)
        values (v_building_name, v_order)
        returning id into v_building_id;
    end if;

    -- 층 — (building_id, label) 유니크. 재사용 or 신규
    select id into v_floor_id
      from floors
     where building_id = v_building_id and label = v_floor_label
     limit 1;
    if v_floor_id is null then
      select coalesce(max(display_order), -1) + 1 into v_order
        from floors where building_id = v_building_id;
      insert into floors (building_id, label, display_order)
        values (v_building_id, v_floor_label, v_order)
        returning id into v_floor_id;
    end if;

    -- 호실 — (floor_id, name) 유니크. 이미 있으면 트랜잭션 전체 롤백 (의도된 동작 — 중복 입력 방지)
    select coalesce(max(display_order), -1) + 1 into v_order
      from rooms where floor_id = v_floor_id;
    insert into rooms (floor_id, name, display_order, active)
      values (v_floor_id, v_room_name, v_order, true);
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

-- 서비스 롤만 호출 (모든 admin server action 은 service role 키로 접근)
revoke all on function bulk_insert_departments(jsonb) from public;
revoke all on function bulk_insert_rooms(jsonb) from public;
