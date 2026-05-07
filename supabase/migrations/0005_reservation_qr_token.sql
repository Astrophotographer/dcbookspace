-- 신청서 단위의 단일 QR 토큰
-- 단계별 approval token 대신 reservation 하나당 토큰 하나.
-- QR 스캔 후 PIN으로 결재자(차장/관리장로/당회장)를 식별한다.

alter table reservations
  add column if not exists qr_token text unique;

-- 기존 row 채우기
update reservations
   set qr_token = replace(gen_random_uuid()::text, '-', '')
 where qr_token is null;

-- 이후 row는 자동
alter table reservations
  alter column qr_token set default replace(gen_random_uuid()::text, '-', '');

alter table reservations
  alter column qr_token set not null;
