-- =====================================================
-- 0024: 신청번호(ref_no) 포맷 변경 + 연도 단위 리셋
--
-- 변경 전: 'YY-NNNN' (예: '26-0104'), 전역 sequence, wrap 없음 → 10000건 넘으면 5자리
-- 변경 후: 'YY-NNNN-NN' (6자리 순번, 예: '26-0000-00' ~ '26-9999-99'),
--          연도 단위로 리셋. 연 100만건까지 unique 보장.
--          시리즈는 'S' prefix 유지: 'SYY-NNNN-NN'
--
-- 기존 데이터의 ref_no 는 그대로 둔다 (백워드 호환).
-- 신규 row 부터 새 포맷 적용.
-- =====================================================

-- 연도별 카운터 테이블 — (kind, year_yy) 별로 next_val 만 관리.
-- INSERT ... ON CONFLICT DO UPDATE RETURNING 으로 원자적 증가.
create table if not exists ref_counters (
  kind text not null,         -- 'reservation' | 'series'
  year_yy text not null,      -- '26', '27', ...
  next_val bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (kind, year_yy)
);

-- 일회성 신청 트리거 함수 교체
create or replace function assign_reservation_ref()
returns trigger as $$
declare
  yy text := to_char(now(), 'YY');
  v bigint;
  nnnn_part text;
  nn_part text;
begin
  if NEW.ref_no is null then
    insert into ref_counters (kind, year_yy, next_val, updated_at)
    values ('reservation', yy, 1, now())
    on conflict (kind, year_yy)
    do update set
      next_val = ref_counters.next_val + 1,
      updated_at = now()
    returning next_val into v;

    -- 1,000,000 도달 시 0 으로 wrap (현실적으로 도달 불가하지만 안전망)
    v := mod(v - 1, 1000000);

    -- 0~999999 → 'NNNN-NN' 으로 분할
    nnnn_part := lpad((v / 100)::text, 4, '0');
    nn_part := lpad(mod(v, 100)::text, 2, '0');
    NEW.ref_no := yy || '-' || nnnn_part || '-' || nn_part;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- 시리즈 트리거 함수 교체 ('S' 접두어 유지)
create or replace function assign_series_ref()
returns trigger as $$
declare
  yy text := to_char(now(), 'YY');
  v bigint;
  nnnn_part text;
  nn_part text;
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
    nnnn_part := lpad((v / 100)::text, 4, '0');
    nn_part := lpad(mod(v, 100)::text, 2, '0');
    NEW.ref_no := 'S' || yy || '-' || nnnn_part || '-' || nn_part;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- 기존 sequence 는 더 이상 사용 안 함. 잔존시켜도 무해하지만 정리 차원에서 제거.
-- (drop 시 IF EXISTS 로 안전성 보장 — 이미 사라졌다면 no-op)
drop sequence if exists reservations_ref_seq;
drop sequence if exists reservation_series_ref_seq;
