-- =====================================================
-- 0009: 관리자(admin) 정책 정리
--
-- 정책:
--   - 마스터 키 0000 은 코드에 그대로 유지 (비상용)
--   - 추가로, role='admin' 사용자의 PIN 도 마스터 키처럼 동작 (어떤 단계든 강제 승인)
--   - 관리자 신원은 users 테이블에 role='admin' 으로 저장. 별도 테이블 만들지 않음
--   - 관리자가 0명이면 시스템에 마스터 권한자가 없는 상태가 되므로,
--     fallback 으로 임의의 "홍길동" 1명을 시드로 보장한다 (pin_hash NULL → 화면에서 발급)
-- =====================================================

-- 관리자가 한 명도 없으면 홍길동을 기본 관리자로 등록.
-- pin_hash 는 NULL 로 두고, /admin/admins 화면에서 "PIN 발급" 으로 채운다.
insert into users (name, phone, role, pin_hash, active)
select '홍길동', '010-0000-0001', 'admin', null, true
where not exists (
  select 1 from users where role = 'admin'
);
