-- =====================================================
-- 0019: 사이트 관리자 로그인 자격증명 (BasicAuth → 쿠키 세션 전환)
--
-- 운영 중 web UI 에서 비밀번호 변경 가능하게 하려고 DB-stored hash 도입.
-- env (ADMIN_USERNAME / ADMIN_PASSWORD) 는 초기 시드 + 비상 복구용으로
-- 그대로 사용 — 검증 시 (env 일치) OR (DB hash 일치) 둘 중 하나만 맞으면 통과.
-- env 가 영구 master key 역할 → 비밀번호 분실 시 .env.local 에서 확인해
-- 다시 로그인 후 web UI 에서 새 비밀번호로 갱신할 수 있다.
--
-- 단일 row 가정. username 으로 unique. 일반적으로 row 1개만 들어감.
-- =====================================================

create table admin_credentials (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null, -- bcrypt
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_admin_credentials_updated_at
  before update on admin_credentials
  for each row execute function set_updated_at();
