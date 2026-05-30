-- =====================================================
-- 0032: 신청번호(ref_no) 구분 포맷 변경
--
-- 변경 전: 'YY-NNNN-NN' (예: '26-0001-04')
-- 변경 후: 'YY-NNN-NNN' (예: '26-001-004')
--          시리즈는 'S' prefix 유지: 'SYY-NNN-NNN'
--
-- 기존 데이터의 ref_no 는 그대로 둔다 (백워드 호환).
-- 신규 row 부터 새 포맷 적용.
-- =====================================================

create or replace function assign_reservation_ref()
returns trigger as $$
declare
  yy text := to_char(now(), 'YY');
  v bigint;
  first_part text;
  second_part text;
begin
  if NEW.ref_no is null then
    insert into ref_counters (kind, year_yy, next_val, updated_at)
    values ('reservation', yy, 1, now())
    on conflict (kind, year_yy)
    do update set
      next_val = ref_counters.next_val + 1,
      updated_at = now()
    returning next_val into v;

    v := mod(v - 1, 1000000);
    first_part := lpad((v / 1000)::text, 3, '0');
    second_part := lpad(mod(v, 1000)::text, 3, '0');
    NEW.ref_no := yy || '-' || first_part || '-' || second_part;
  end if;
  return NEW;
end;
$$ language plpgsql;

create or replace function assign_series_ref()
returns trigger as $$
declare
  yy text := to_char(now(), 'YY');
  v bigint;
  first_part text;
  second_part text;
begin
  if NEW.ref_no is null then
    insert into ref_counters (kind, year_yy, next_val, updated_at)
    values ('series', yy, 1, now())
    on conflict (kind, year_yy)
    do update set
      next_val = ref_counters.next_val + 1,
      updated_at = now()
    returning next_val into v;

    v := mod(v - 1, 1000000);
    first_part := lpad((v / 1000)::text, 3, '0');
    second_part := lpad(mod(v, 1000)::text, 3, '0');
    NEW.ref_no := 'S' || yy || '-' || first_part || '-' || second_part;
  end if;
  return NEW;
end;
$$ language plpgsql;
