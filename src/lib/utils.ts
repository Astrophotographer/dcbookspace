import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ko } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * KST 고정 timezone. Vercel runtime 은 UTC, 사용자 브라우저는 KST 라서
 * date-fns 의 로컬 `format()` 그대로 쓰면 SSR ↔ hydration 간 시각 표기가 어긋남
 * (React error #418 hydration mismatch). 모든 사용자 노출 시간 표기는 KST 고정.
 */
const KST = "Asia/Seoul";

/**
 * date-fns `format` 의 KST 고정 버전. import 한 줄만 바꾸면 기존 호출 시그니처 그대로.
 *   import { format } from "date-fns";  →  import { formatKst as format } from "@/lib/utils";
 * Date · ISO 문자열 · 숫자 (epoch ms) 모두 받음.
 */
export function formatKst(
  d: Date | string | number,
  fmt: string,
  options?: Parameters<typeof formatInTimeZone>[3],
): string {
  return formatInTimeZone(d, KST, fmt, options);
}

// 표시용 날짜 포맷터. 모든 사용자 노출 날짜는 YYYY/MM/DD 로 통일.
// 내부 키(URL 파라미터, Map 키, DB 비교)는 별도로 yyyy-MM-dd 를 직접 쓰는 위치에서
// 유지된다 — 이 함수는 "사람이 보는" 용도.
export function formatDate(d: Date | string, fmt = "yyyy/MM/dd") {
  const date = typeof d === "string" ? parseISO(d) : d;
  return formatInTimeZone(date, KST, fmt, { locale: ko });
}

export function formatDateTime(d: Date | string) {
  return formatDate(d, "yyyy/MM/dd (E) HH:mm");
}

export function formatTime(d: Date | string) {
  return formatDate(d, "HH:mm");
}

/**
 * 시작~종료 시각의 차이를 한국어 'X 시간 Y 분' 형식으로.
 * - 30분 단위로 반올림하지 않고, 분 단위 그대로
 * - 정시(0분) 이면 '1 시간', 시간 0 이면 '30 분' 식으로 단위 생략
 */
export function formatDuration(startISO: string, endISO: string): string {
  const diffMs = Date.parse(endISO) - Date.parse(startISO);
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "";
  const totalMin = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins} 분`;
  if (mins === 0) return `${hours} 시간`;
  return `${hours} 시간 ${mins} 분`;
}

// 슬래시 형식 (YYYY/MM/DD HH:mm) — 서류 출력용
export function formatDateSlash(d: Date | string) {
  return formatDate(d, "yyyy/MM/dd HH:mm");
}

// 사용일시 표시: 같은 날짜면 'MM월 DD일(요일) HH:MM ~ HH:MM',
// 다른 날짜면 'MM월 DD일(요일) HH:MM ~ MM월 DD일(요일) HH:MM'.
// 종이 신청서 본문에 그대로 들어가는 표기. 모두 KST 고정.
export function formatUsageRange(startISO: string, endISO: string): string {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const sameDay =
    formatInTimeZone(start, KST, "yyyy-MM-dd") ===
    formatInTimeZone(end, KST, "yyyy-MM-dd");
  const head = formatInTimeZone(start, KST, "MM월 dd일(E)", { locale: ko });
  if (sameDay) {
    return `${head} ${formatInTimeZone(start, KST, "HH:mm")} ~ ${formatInTimeZone(end, KST, "HH:mm")}`;
  }
  const tail = formatInTimeZone(end, KST, "MM월 dd일(E)", { locale: ko });
  return `${head} ${formatInTimeZone(start, KST, "HH:mm")} ~ ${tail} ${formatInTimeZone(end, KST, "HH:mm")}`;
}

/**
 * QR 토큰이 들어가는 외부 접근 URL을 만든다.
 * - NEXT_PUBLIC_APP_URL이 localhost가 아니면 그쪽 우선 (외부 도메인/터널 노출 시)
 * - 아니면 요청 호스트(`Host` 헤더)를 사용 → 같은 LAN의 휴대폰도 스캔 가능
 */
export function resolveBaseUrl(opts: {
  envUrl?: string | null;
  host?: string | null;
  proto?: string | null;
}): string {
  const { envUrl, host, proto } = opts;
  const isLocal = (s?: string | null) =>
    !!s && /(^|\/\/)(localhost|127\.0\.0\.1)/.test(s);
  if (envUrl && !isLocal(envUrl)) return envUrl;
  const h = host ?? "localhost:3000";
  const p = proto ?? "http";
  return `${p}://${h}`;
}
