import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import type { FixedEvent, TimeBlock } from "@/lib/supabase/types";

const KOR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekdayLabel(weekday: number): string {
  return KOR_WEEKDAYS[weekday] ?? "?";
}

export type FixedEventInstance = FixedEvent & {
  /** "YYYY-MM-DD" — KST 기준 발생 날짜 */
  occurrence_date: string;
  /** ISO with KST offset, 예약 행과 같은 형식이라 정렬·필터에 그대로 쓰임 */
  start_at: string;
  end_at: string;
};

/**
 * 고정 행사를 [from, to] 날짜 범위 안의 실제 발생 인스턴스로 펼친다.
 *
 * - weekday + effective_from/until 안에 들어오는 날짜만 emit
 * - active=false 는 호출 측에서 미리 거르거나, 여기서도 거름 (옵션)
 *
 * @param events  fixed_events 행
 * @param fromISO "YYYY-MM-DD" 시작 (포함)
 * @param toISO   "YYYY-MM-DD" 끝 (포함)
 */
export function expandFixedEvents(
  events: FixedEvent[],
  fromISO: string,
  toISO: string,
): FixedEventInstance[] {
  if (!events.length) return [];
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  if (to < from) return [];

  const result: FixedEventInstance[] = [];
  // 날짜 범위가 넓을 수 있으니, 이벤트별로 시작 weekday 까지 점프해서 7일씩 stride.
  for (const ev of events) {
    if (!ev.active) continue;
    const effFrom = parseISO(ev.effective_from);
    const effUntil = ev.effective_until ? parseISO(ev.effective_until) : null;

    // 윈도우 = max(from, effFrom) ~ min(to, effUntil)
    const winStart = effFrom > from ? effFrom : from;
    const winEnd = effUntil && effUntil < to ? effUntil : to;
    if (winEnd < winStart) continue;

    // winStart 이후 첫 weekday 매칭 일자 찾기
    const startDow = winStart.getDay();
    const offset = (ev.weekday - startDow + 7) % 7;
    let cursor = addDays(winStart, offset);
    while (cursor <= winEnd) {
      const dateStr = format(cursor, "yyyy-MM-dd");
      result.push({
        ...ev,
        occurrence_date: dateStr,
        start_at: `${dateStr}T${shortTime(ev.start_time)}:00+09:00`,
        end_at: `${dateStr}T${shortTime(ev.end_time)}:00+09:00`,
      });
      cursor = addDays(cursor, 7);
    }
  }
  // 시작 시각으로 정렬 (날짜 → 시간)
  result.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return result;
}

/**
 * "HH:MM:SS" → "HH:MM" / "HH:MM" 그대로
 */
export function shortTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/**
 * 한 날짜에 매칭되는 고정 행사만 빠르게 추리는 헬퍼 (DateView 셀 별 lookup 용).
 */
export function fixedEventsByDate(
  instances: FixedEventInstance[],
): Map<string, FixedEventInstance[]> {
  const map = new Map<string, FixedEventInstance[]>();
  for (const inst of instances) {
    const arr = map.get(inst.occurrence_date) ?? [];
    arr.push(inst);
    map.set(inst.occurrence_date, arr);
  }
  return map;
}

/**
 * 한 날짜의 fromISO~toISO 사이를 6주 그리드처럼 강제로 펼치고 싶을 때.
 * (현재는 호출 안 하지만 추후 필요 시)
 */
export function daysBetween(fromISO: string, toISO: string): Date[] {
  return eachDayOfInterval({
    start: parseISO(fromISO),
    end: parseISO(toISO),
  });
}

// =====================================================
// 시리즈 (정기 신청) 회차 계산
// =====================================================

/** 시리즈가 한 번에 만들 수 있는 회차 수 상한 (약 1년). */
export const MAX_OCCURRENCES = 52;

/** 회차 × 시간대 곱이 너무 많으면 DB 보호용으로 차단. */
export const MAX_RESERVATIONS_PER_SERIES = 200;

/**
 * 시작일~종료일 사이에서 매주 weekday 에 해당하는 날짜 배열을 반환.
 * 시작일이 weekday 와 다르면 첫 매칭 일자부터 시작.
 */
export function computeWeeklyOccurrences(
  startDate: string, // YYYY-MM-DD (KST)
  endDate: string,
  weekday: number,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  // 단순 Date 파싱은 UTC 기준이라 KST dow 가 어긋날 수 있음 — 정오로 고정해 안전하게.
  const start = new Date(`${startDate}T12:00:00+09:00`);
  const end = new Date(`${endDate}T12:00:00+09:00`);
  if (end < start) return [];

  const offset = (weekday - start.getDay() + 7) % 7;
  let cursor = new Date(start.getTime());
  cursor.setDate(cursor.getDate() + offset);

  const out: string[] = [];
  while (cursor <= end && out.length < MAX_OCCURRENCES) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor = new Date(cursor.getTime());
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

/**
 * UI 미리보기용 라벨 — "매주 토 14:00–16:00, 18:00–20:00 · 6/6 ~ 12/26 (총 26회 × 2시간대 = 52개 예약)"
 */
export function describeSeries(input: {
  weekday: number;
  startDate: string;
  endDate: string;
  timeBlocks: TimeBlock[];
}): string {
  const occ = computeWeeklyOccurrences(
    input.startDate,
    input.endDate,
    input.weekday,
  );
  const wd = weekdayLabel(input.weekday);
  const blocks = input.timeBlocks
    .map((b) => `${b.start}–${b.end}`)
    .join(", ");
  const range = `${formatShortDate(input.startDate)} ~ ${formatShortDate(input.endDate)}`;
  const totalRows = occ.length * input.timeBlocks.length;
  const blocksTail =
    input.timeBlocks.length > 1
      ? ` × ${input.timeBlocks.length}시간대 = ${totalRows}개 예약`
      : `${occ.length === totalRows ? "" : ` = ${totalRows}개 예약`}`;
  return `매주 ${wd} ${blocks} · ${range} (총 ${occ.length}회${blocksTail})`;
}

function formatShortDate(d: string): string {
  // "2026-06-06" → "6/6"
  const [, m, day] = d.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

/** 두 시간대가 [start, end) 기준으로 겹치는지. */
export function timeBlocksOverlap(a: TimeBlock, b: TimeBlock): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 폼 검증: 시간대 배열이 자기들끼리 겹치지 않고 start<end 인지. */
export function validateTimeBlocks(
  blocks: TimeBlock[],
): string | null {
  if (blocks.length === 0) return "시간대를 최소 1개 입력해 주세요.";
  for (const b of blocks) {
    if (!/^\d{2}:\d{2}$/.test(b.start) || !/^\d{2}:\d{2}$/.test(b.end)) {
      return "시간 형식이 올바르지 않습니다 (HH:MM).";
    }
    if (b.end <= b.start) {
      return "각 시간대의 종료 시간은 시작보다 늦어야 합니다.";
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (timeBlocksOverlap(blocks[i], blocks[j])) {
        return "시간대끼리 서로 겹치지 않게 입력해 주세요.";
      }
    }
  }
  return null;
}
