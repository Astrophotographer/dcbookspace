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
- **마스터 키 `0000`**: 비상용. 어떤 단계든 강제 승인 (코드 내 하드코딩 유지, 절대 제거 금지)
- **관리자 마스터 PIN**: `users.role='admin'` 사용자의 PIN(휴대폰 뒷 4자리, bcrypt)도 마스터처럼 동작 — 어떤 단계든 강제 승인. `/admin/admins` 에서 관리. 관리자가 0명이 되지 않도록 시드(`홍길동`) 보장 ([0009 마이그레이션](supabase/migrations/0009_default_admin.sql))
- **Derived status**: `reservations.status='pending'` 동안 화면은 진행도에 따라 `결재대기중 / 결재진행중`으로 표시 — DB enum 변경 금지, derive 로직 사용
- **Realtime**: rooms / reservations / approvals는 publication에 추가됨. 새 테이블 추가 시 마이그레이션에서 publication 등록도 함께

## 보안 불변식
- `/admin/*` 는 BasicAuth 미들웨어로 server action POST 포함 전부 보호
- `ADMIN_PASSWORD` 비면 503 반환 — 실수로 보호 풀린 채 배포되는 걸 막음. 우회 금지
- `SUPABASE_SERVICE_ROLE_KEY` 는 서버 전용. 절대 클라이언트 번들에 노출 금지
- `APPROVAL_SESSION_SECRET` 비면 5분 자동 세션 비활성. 매 QR마다 PIN 입력. graceful degrade.
- **마스터 키 `0000` 은 5분 자동 세션 대상 제외** (1건만 처리). 운영자 비상용 의도 유지
- 시크릿은 `.env.local`. 코드 하드코딩 금지

## DB 안전 (로컬은 항상 staging)

**운영 원칙 (2026-05-12)**: 로컬·AI 보조 작업은 절대 prod DB(`lcndkzfvrkwlzkyppdzh` / DCbook) 를 건드리지 않는다. 항상 staging DB(`bqtxkkqgpgyviczyoqix` / DCbookingproject) 에서 작업.

**자동 방어선**:
- [src/lib/db-safety.ts](src/lib/db-safety.ts) — `assertSafeDbForLocalDev()` 가 모든 Supabase 클라이언트 생성 시 첫 호출. 로컬 dev (`NODE_ENV=development` or `APP_URL=localhost`) 에서 prod ref 발견 → 즉시 throw → 서버 부팅 차단.
- `npm run dev` 가 `predev` hook 으로 [scripts/check-db-env.mjs](scripts/check-db-env.mjs) 자동 실행 → `.env.local` + `supabase/.temp/project-ref` 검사. prod 감지 시 exit 1 → dev 시작 안 됨.
- 언제든 수동 점검: `npm run db:check`.

**prod 마이그레이션은 사람의 명시적 클릭만**: GitHub Actions → "DB migrate (prod)" → confirm 입력 `PROD` ([db-migrate-prod.yml](.github/workflows/db-migrate-prod.yml)). CLI 에서 `supabase link --project-ref lcndkzfvrkwlzkyppdzh` 같은 명령은 절대 실행 X.

작업 도중 prod ref 가 어떤 위치(코드/env/명령어)에 등장하면 **즉시 사용자에게 알리고 멈출 것**.

## 배포 (브랜치·DB 분리)

| 브랜치 | 환경 | URL | Supabase |
|---|---|---|---|
| `main` | **production** | `dcbook.vercel.app` | **신규 ref `lcndkzfvrkwlzkyppdzh`** (2026-05-12 신설, 빈 DB) |
| `develop` | **staging** | `dcbookspace.vercel.app` | **기존 ref `bqtxkkqgpgyviczyoqix`** (기존 테스트 데이터 재활용) |

**일상 작업**: develop 에 푸시 → preview 배포 → `dcbookspace.vercel.app` 에서 검증.
**릴리스**: `git checkout main && git merge develop --no-ff` → tag → push → prod 배포. 후 `develop` 도 `main` 으로 sync.
**핫픽스**: `hotfix/*` 브랜치 main 분기 → 수정 → main 머지 → develop 으로 forward-merge.

**버전 표기**:
- develop = `vX.Y*` (별표 = 미릴리스)
- main release = `vX.Y` (별표 제거) + `git tag vX.Y`

**마이그레이션 순서 (엄수)**:
1. develop 푸시 → **GitHub Actions 가 staging DB 에 자동 적용** ([db-migrate-staging.yml](.github/workflows/db-migrate-staging.yml))
2. `dcbookspace.vercel.app` preview 에서 검증
3. main 머지 → Vercel prod 빌드 (코드만)
4. **GitHub Actions 페이지 → "DB migrate (prod)" → Run workflow → confirm=`PROD`** 입력해 수동 적용 ([db-migrate-prod.yml](.github/workflows/db-migrate-prod.yml))

> prod 자동 적용은 의도적으로 안 함. 실 사용자 DB 변형은 사람의 한 번의 클릭을 거쳐야 한다는 원칙.

자세한 절차: [/Users/chris/.claude/plans/moonlit-growing-petal.md](file:///Users/chris/.claude/plans/moonlit-growing-petal.md)

## 디렉토리별 가이드
세부 규칙은 해당 디렉토리의 AGENTS.md 참고:
- [supabase/AGENTS.md](supabase/AGENTS.md) — 마이그레이션·RPC·트리거
- [src/app/admin/AGENTS.md](src/app/admin/AGENTS.md) — 관리자 동작·호실 좌표
- [src/components/AGENTS.md](src/components/AGENTS.md) — 노년층 친화 UX 규칙
