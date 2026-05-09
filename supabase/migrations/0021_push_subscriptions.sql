-- =====================================================
-- 0021: PWA 푸시 알림 구독 정보
--
-- Web Push API 의 PushSubscription 객체를 그대로 보관.
-- - endpoint: 브라우저 측 push 서비스 엔드포인트 (FCM / APNs / Mozilla)
-- - p256dh / auth: ECDH 키 (페이로드 암호화)
-- 한 사용자(user_id) 가 여러 기기/브라우저에서 구독 가능 → endpoint 별로 row.
-- 발송 실패(410 Gone) 시 행을 삭제해 좀비 구독 정리.
-- =====================================================

create table push_subscriptions (
  -- gen_random_uuid() 는 Postgres 13+ 내장(pgcrypto 별도 활성화 불필요).
  -- supabase 환경에서 uuid-ossp 가 extensions schema 에 격리돼 search_path 미스 나는 케이스 회피.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_push_user on push_subscriptions(user_id);
