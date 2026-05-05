# DCbookspace

교회 장소 사용 신청·결재 시스템. 종이 양식 + PIN 기반 결재 흐름을 디지털화.

## Stack
- Next.js 16 (App Router, Turbopack, Server Actions) · React 19 · TypeScript
- Tailwind v4 · Supabase (Postgres + Realtime) · bcrypt(PIN 해시)

## ⚠️ Next.js 16 주의
이 버전은 학습 데이터와 다른 breaking change가 있다. 코드 작성 전 `node_modules/next/dist/docs/` 의 관련 가이드를 먼저 읽고, deprecation 경고는 무시하지 말 것.

## 명령어
- `npm run dev` — 개발 서버 (http://localhost:3000)
- `npm run build` / `npm start`
- `npm run lint` — ESLint (PR 전 필수)
- `supabase db push` — 마이그레이션 적용

## 핵심 아키텍처
- **인증 모델**: 사용자 계정 없음. 결재자는 PIN 4자리(bcrypt)로 식별
- **QR 토큰**: 신청서당 1개(`reservations.qr_token`). 모든 결재 단계가 같은 QR을 공유, PIN으로 단계 라우팅
- **마스터 키 `0000`**: 어떤 단계든 강제 승인 (운영자용, 코드 내 하드코딩 유지)
- **Derived status**: `reservations.status='pending'` 동안 화면은 진행도에 따라 `결재대기중 / 결재진행중`으로 표시 — DB enum 변경 금지, derive 로직 사용
- **Realtime**: rooms / reservations / approvals는 publication에 추가됨. 새 테이블 추가 시 마이그레이션에서 publication 등록도 함께

## 보안 불변식
- `/admin/*` 는 BasicAuth 미들웨어로 server action POST 포함 전부 보호
- `ADMIN_PASSWORD` 비면 503 반환 — 실수로 보호 풀린 채 배포되는 걸 막음. 우회 금지
- `SUPABASE_SERVICE_ROLE_KEY` 는 서버 전용. 절대 클라이언트 번들에 노출 금지
- `APPROVAL_SESSION_SECRET` 비면 5분 자동 세션 비활성. 매 QR마다 PIN 입력. graceful degrade.
- **마스터 키 `0000` 은 5분 자동 세션 대상 제외** (1건만 처리). 운영자 비상용 의도 유지
- 시크릿은 `.env.local`. 코드 하드코딩 금지

## 디렉토리별 가이드
세부 규칙은 해당 디렉토리의 AGENTS.md 참고:
- [supabase/AGENTS.md](supabase/AGENTS.md) — 마이그레이션·RPC·트리거
- [src/app/admin/AGENTS.md](src/app/admin/AGENTS.md) — 관리자 동작·호실 좌표
- [src/components/AGENTS.md](src/components/AGENTS.md) — 노년층 친화 UX 규칙
