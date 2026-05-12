/**
 * DB 환경 식별 + 로컬 개발 시 prod 연결 차단.
 *
 * 운영 원칙 (2026-05-12 사용자 선언):
 *   "로컬 작업은 절대 prod DB(DCbook) 를 건드리지 않는다 — 항상 staging."
 *
 * 이 모듈은 그 원칙을 코드 레벨에서 강제한다:
 *   - createServiceClient/createClient 가 호출되는 순간 첫 검사 수행
 *   - 로컬 개발 환경에서 prod ref 가 박혀 있으면 즉시 throw → 서버가 부팅 안 됨
 *   - 정상 Vercel prod 배포에서는 통과 (NODE_ENV=production AND APP_URL 이 localhost 아님)
 *
 * 별도 CLI 점검: `npm run db:check` (scripts/check-db-env.mjs)
 */

// Supabase project refs — AGENTS.md 의 배포 매트릭스와 일치
export const PROD_SUPABASE_REF = "lcndkzfvrkwlzkyppdzh"; // DCbook (main → dcbook.vercel.app)
export const STAGING_SUPABASE_REF = "bqtxkkqgpgyviczyoqix"; // DCbookingproject (develop → dcbookspace.vercel.app)

export type DbEnvironment = "prod" | "staging" | "unknown";

export function detectDbEnvironment(
  url: string | undefined | null,
): DbEnvironment {
  if (!url) return "unknown";
  if (url.includes(PROD_SUPABASE_REF)) return "prod";
  if (url.includes(STAGING_SUPABASE_REF)) return "staging";
  return "unknown";
}

/**
 * "로컬 개발으로 보이는가" 휴리스틱.
 *   - NODE_ENV=development (next dev) 거의 확정
 *   - 또는 NEXT_PUBLIC_APP_URL 이 localhost — 로컬 build+start 도 잡힘
 * Vercel 배포는 NODE_ENV=production + APP_URL=실제 도메인 이라 둘 다 false.
 */
function looksLikeLocalDev(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return /(^|\/\/)(localhost|127\.0\.0\.1)/.test(appUrl);
}

let alreadyChecked = false;

/**
 * 서버 코드 첫 진입 시 한 번 호출. 로컬 개발인데 prod ref 발견되면 throw.
 * idempotent — 여러 번 호출돼도 첫 호출만 검사.
 */
export function assertSafeDbForLocalDev(): void {
  if (alreadyChecked) return;
  alreadyChecked = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const env = detectDbEnvironment(url);
  const local = looksLikeLocalDev();

  if (local && env === "prod") {
    const msg = [
      "",
      "═══════════════════════════════════════════════════════════════════",
      "🚨 prod DB 연결이 감지되어 로컬 서버 부팅을 중단합니다.",
      "",
      `   NEXT_PUBLIC_SUPABASE_URL = ${url}`,
      `   탐지된 환경            = prod (ref ${PROD_SUPABASE_REF})`,
      "",
      "   로컬 작업은 staging DB 만 사용한다는 규칙이 설정돼 있습니다.",
      "   .env.local 의 SUPABASE URL/KEY 를 staging 으로 교체해 주세요.",
      `   staging ref: ${STAGING_SUPABASE_REF}`,
      "═══════════════════════════════════════════════════════════════════",
      "",
    ].join("\n");
    // 콘솔 + throw 동시에 — Next.js 에러 화면에서도 메시지 보이게.
    console.error(msg);
    throw new Error("Local dev blocked: prod DB connection detected");
  }

  // 로컬 dev 일 때 어느 DB 에 붙었는지 1회 로깅 — 시각 확인 용
  if (local) {
    const label =
      env === "staging" ? "STAGING (안전)" : `UNKNOWN (${url ?? "URL 없음"})`;
    console.info(`[db-safety] 로컬 개발 — Supabase 연결: ${label}`);
  }
}
