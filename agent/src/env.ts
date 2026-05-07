// 환경변수 검증. 필수 값이 빠져있으면 명시적으로 죽인다.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[env] ${name} 가 설정되지 않았습니다.`);
    process.exit(1);
  }
  return v;
}
function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  /** Vercel 사이트 URL — "https://dcbookspace.vercel.app" */
  appBaseUrl: required("APP_BASE_URL").replace(/\/$/, ""),
  /** /api/print/* 호출 시 Authorization 헤더에 실어 보낼 토큰. Vercel env 와 동일해야 함 */
  agentToken: required("PRINT_AGENT_TOKEN"),
  /** Sindoh D450 의 LAN IP — "192.168.0.50" */
  printerHost: required("PRINTER_HOST"),
  /** Raw 9100 포트. 보통 9100 고정 */
  printerPort: int("PRINTER_PORT", 9100),
  /** 폴링 주기 (초). 기본 5초 */
  pollIntervalSec: int("POLL_INTERVAL_SEC", 5),
};
