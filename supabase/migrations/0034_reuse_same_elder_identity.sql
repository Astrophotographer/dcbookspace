-- 0034: 이름 + 휴대폰이 같은 담당장로는 같은 계정으로 인식

-- 이미 중복 생성된 active 담당장로 계정이 있으면 가장 먼저 생성된 계정을 대표로 삼아
-- departments.elder_id 를 대표 계정으로 모은다.
with elder_identity as (
  select
    id,
    first_value(id) over (
      partition by btrim(name), regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      order by created_at, id
    ) as canonical_id
  from users
  where role = 'elder'
    and active = true
    and nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is not null
)
update departments d
   set elder_id = e.canonical_id
  from elder_identity e
 where d.elder_id = e.id
   and e.id <> e.canonical_id;

-- 로그인 시 중복 계정이 먼저 잡히지 않도록 대표가 아닌 중복 계정은 비활성화한다.
with elder_identity as (
  select
    id,
    first_value(id) over (
      partition by btrim(name), regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      order by created_at, id
    ) as canonical_id
  from users
  where role = 'elder'
    and active = true
    and nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is not null
)
update users u
   set active = false,
       updated_at = now()
  from elder_identity e
 where u.id = e.id
   and e.id <> e.canonical_id;

create unique index if not exists users_active_elder_name_phone_key
  on users (
    btrim(name),
    regexp_replace(coalesce(phone, ''), '\D', '', 'g')
  )
  where role = 'elder'
    and active = true
    and nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is not null;

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
      select coalesce(max(display_order), -1) + 1 into v_order
        from departments where parent_id = v_group_id;
      insert into departments (name, parent_id, display_order)
        values (v_leaf_name, v_group_id, v_order)
        returning id into v_leaf_id;
      inserted_count := inserted_count + 1;

      if v_head_name is not null and v_head_phone is not null and v_head_pin_hash is not null then
        insert into users (name, phone, role, dept_id, pin_hash)
          values (v_head_name, v_head_phone, 'dept_head', v_leaf_id, v_head_pin_hash)
          returning id into v_user_id;
        update departments set dept_head_id = v_user_id where id = v_leaf_id;
      end if;

      if v_elder_name is not null and v_elder_phone is not null and v_elder_pin_hash is not null then
        select id into v_user_id
          from users
         where role = 'elder'
           and active = true
           and btrim(name) = v_elder_name
           and regexp_replace(coalesce(phone, ''), '\D', '', 'g') =
               regexp_replace(v_elder_phone, '\D', '', 'g')
         order by created_at, id
         limit 1;

        if v_user_id is null then
          insert into users (name, phone, role, dept_id, pin_hash)
            values (
              v_elder_name,
              regexp_replace(v_elder_phone, '\D', '', 'g'),
              'elder',
              v_leaf_id,
              v_elder_pin_hash
            )
            returning id into v_user_id;
        else
          update users
             set pin_hash = coalesce(pin_hash, v_elder_pin_hash),
                 phone = coalesce(phone, regexp_replace(v_elder_phone, '\D', '', 'g')),
                 updated_at = now()
           where id = v_user_id;
        end if;

        update departments set elder_id = v_user_id where id = v_leaf_id;
      end if;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function bulk_insert_departments(jsonb) from public;
