import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 표시용 날짜 포맷터. 모든 사용자 노출 날짜는 YYYY/MM/DD 로 통일.
// 내부 키(URL 파라미터, Map 키, DB 비교)는 별도로 yyyy-MM-dd 를 직접 쓰는 위치에서
// 유지된다 — 이 함수는 "사람이 보는" 용도.
export function formatDate(d: Date | string, fmt = "yyyy/MM/dd") {
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, fmt, { locale: ko });
}

export function formatDateTime(d: Date | string) {
  return formatDate(d, "yyyy/MM/dd (E) HH:mm");
}

export function formatTime(d: Date | string) {
  return formatDate(d, "HH:mm");
}

// 슬래시 형식 (YYYY/MM/DD HH:mm) — 서류 출력용
export function formatDateSlash(d: Date | string) {
  return formatDate(d, "yyyy/MM/dd HH:mm");
}

// 사용일시 표시: 같은 날짜면 'YYYY/MM/DD (요일) HH:MM ~ HH:MM',
// 다른 날짜면 시작/종료를 모두 풀로 출력.
export function formatUsageRange(startISO: string, endISO: string): string {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  if (sameDay) {
    const head = format(start, "yyyy/MM/dd (E)", { locale: ko });
    return `${head} ${format(start, "HH:mm")} ~ ${format(end, "HH:mm")}`;
  }
  return `${formatDateTime(startISO)} ~ ${formatDateTime(endISO)}`;
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
