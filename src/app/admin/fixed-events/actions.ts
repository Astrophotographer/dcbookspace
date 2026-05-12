"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { FixedEvent } from "@/lib/supabase/types";
import {
  checkRequiredHeaders,
  makeRowAccessor,
  parseCsv,
  type BulkRowError,
} from "@/lib/bulk-csv";

type Result<T = unknown> = T & { error?: string };

const WEEKDAY_MAP: Record<string, number> = {
  "일요일": 0, "일": 0, "Sun": 0, "sun": 0,
  "월요일": 1, "월": 1, "Mon": 1, "mon": 1,
  "화요일": 2, "화": 2, "Tue": 2, "tue": 2,
  "수요일": 3, "수": 3, "Wed": 3, "wed": 3,
  "목요일": 4, "목": 4, "Thu": 4, "thu": 4,
  "금요일": 5, "금": 5, "Fri": 5, "fri": 5,
  "토요일": 6, "토": 6, "Sat": 6, "sat": 6,
};

function revalidateAll() {
  revalidatePath("/admin/fixed-events");
  revalidatePath("/");
  revalidatePath("/apply");
}

function parseTime(raw: string): string | null {
  // "HH:MM" → "HH:MM:00", "HH:MM:SS" 그대로
  const t = raw.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function readForm(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const roomId = String(fd.get("room_id") ?? "");
  const weekdayRaw = String(fd.get("weekday") ?? "");
  const start = parseTime(String(fd.get("start_time") ?? ""));
  const end = parseTime(String(fd.get("end_time") ?? ""));
  const effFromRaw = String(fd.get("effective_from") ?? "").trim();
  const effUntilRaw = String(fd.get("effective_until") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim() || null;

  if (!name) return { error: "행사 이름을 입력해주세요." };
  if (!roomId) return { error: "호실을 선택해주세요." };

  const weekday = parseInt(weekdayRaw, 10);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { error: "요일을 선택해주세요." };
  }
  if (!start || !end) return { error: "시작·종료 시간을 입력해주세요." };
  if (end <= start) return { error: "종료 시간이 시작 시간보다 빠릅니다." };

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  const effective_from = /^\d{4}-\d{2}-\d{2}$/.test(effFromRaw)
    ? effFromRaw
    : today;
  const effective_until =
    effUntilRaw && /^\d{4}-\d{2}-\d{2}$/.test(effUntilRaw)
      ? effUntilRaw
      : null;
  if (effective_until && effective_until < effective_from) {
    return { error: "종료일이 시작일보다 빠릅니다." };
  }

  return {
    name,
    room_id: roomId,
    weekday,
    start_time: start,
    end_time: end,
    effective_from,
    effective_until,
    notes,
  };
}

export async function createFixedEvent(
  fd: FormData,
): Promise<Result<{ event?: FixedEvent }>> {
  const parsed = readForm(fd);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createServiceClient();
  const { data: maxRow } = await supabase
    .from("fixed_events")
    .select("display_order")
    .eq("weekday", parsed.weekday)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("fixed_events")
    .insert({ ...parsed, display_order })
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidateAll();
  return { event: data as FixedEvent };
}

export async function updateFixedEvent(
  id: string,
  fd: FormData,
): Promise<Result> {
  const parsed = readForm(fd);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("fixed_events")
    .update(parsed)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}

export async function deleteFixedEvent(id: string): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("fixed_events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

/**
 * CSV 텍스트로 고정 행사를 한 번에 등록.
 * - 한 줄이라도 검증 실패 시 아무것도 저장하지 않음 (단일 insert → FK 위반 시 PG 가 전체 롤백).
 * - 컬럼: 요일, 시간 (예 "10:00-12:00"), 행사명, 건물, 층, 호실 / 옵션: 시작일, 종료일, 비고
 */
export async function bulkImportFixedEvents(text: string): Promise<{
  ok: boolean;
  count: number;
  errors?: BulkRowError[];
}> {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    return {
      ok: false,
      count: 0,
      errors: [{ row: 1, message: e instanceof Error ? e.message : "CSV 파싱 실패" }],
    };
  }

  const missing = checkRequiredHeaders(parsed.headers, [
    { keys: ["요일"], label: "요일" },
    { keys: ["시간"], label: "시간" },
    { keys: ["행사명", "이름"], label: "행사명" },
    { keys: ["건물"], label: "건물" },
    { keys: ["층"], label: "층" },
    { keys: ["호실"], label: "호실" },
  ]);
  if (missing) return { ok: false, count: 0, errors: [{ row: 1, message: missing }] };

  if (parsed.rows.length === 0) {
    return { ok: false, count: 0, errors: [{ row: 1, message: "데이터 줄이 없습니다." }] };
  }

  const get = makeRowAccessor(parsed.headers);
  const supabase = createServiceClient();

  // 장소 조회용 인덱스 — 한 번만 로드해서 행마다 in-memory 매칭
  const [{ data: buildings }, { data: floors }, { data: rooms }] = await Promise.all([
    supabase.from("buildings").select("id, name"),
    supabase.from("floors").select("id, building_id, label"),
    supabase.from("rooms").select("id, floor_id, name").eq("active", true),
  ]);

  const errors: BulkRowError[] = [];
  const records: Array<{
    name: string;
    room_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_until: string | null;
    notes: string | null;
  }> = [];

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());

  for (const r of parsed.rows) {
    const lineNo = parsed.sourceLine[r.row];
    const weekdayRaw = get(r.cells, "요일").trim();
    const timeRaw = get(r.cells, "시간").trim();
    const name = get(r.cells, "행사명", "이름").trim();
    const buildingName = get(r.cells, "건물").trim();
    const floorLabel = get(r.cells, "층").trim();
    const roomName = get(r.cells, "호실").trim();
    const effFromRaw = get(r.cells, "시작일").trim();
    const effUntilRaw = get(r.cells, "종료일").trim();
    const notes = get(r.cells, "비고").trim();

    if (!weekdayRaw || !timeRaw || !name || !buildingName || !floorLabel || !roomName) {
      errors.push({ row: lineNo, message: "필수 컬럼이 비어있습니다." });
      continue;
    }
    const weekday = WEEKDAY_MAP[weekdayRaw];
    if (weekday === undefined) {
      errors.push({ row: lineNo, message: `요일을 알 수 없습니다: "${weekdayRaw}"` });
      continue;
    }

    // 시간 파싱 — "10:00-12:00" / "10:00–12:00" / "10:00—12:00" / 공백 허용
    const m = timeRaw.match(/^(\d{1,2}:\d{2})\s*[-–—~]\s*(\d{1,2}:\d{2})$/);
    if (!m) {
      errors.push({
        row: lineNo,
        message: `시간 형식이 잘못됐습니다 (예: 10:00-12:00): "${timeRaw}"`,
      });
      continue;
    }
    const startTime = `${m[1].padStart(5, "0")}:00`;
    const endTime = `${m[2].padStart(5, "0")}:00`;
    if (endTime <= startTime) {
      errors.push({ row: lineNo, message: "종료 시간이 시작 시간보다 빠르거나 같습니다." });
      continue;
    }

    const b = (buildings ?? []).find((x) => x.name === buildingName);
    if (!b) {
      errors.push({ row: lineNo, message: `건물을 찾을 수 없습니다: "${buildingName}"` });
      continue;
    }
    const f = (floors ?? []).find(
      (x) => x.building_id === b.id && x.label === floorLabel,
    );
    if (!f) {
      errors.push({
        row: lineNo,
        message: `층을 찾을 수 없습니다: "${buildingName} ${floorLabel}"`,
      });
      continue;
    }
    const room = (rooms ?? []).find(
      (x) => x.floor_id === f.id && x.name === roomName,
    );
    if (!room) {
      errors.push({
        row: lineNo,
        message: `호실을 찾을 수 없습니다: "${buildingName} ${floorLabel} ${roomName}"`,
      });
      continue;
    }

    const effFrom = /^\d{4}-\d{2}-\d{2}$/.test(effFromRaw) ? effFromRaw : today;
    const effUntil =
      effUntilRaw && /^\d{4}-\d{2}-\d{2}$/.test(effUntilRaw) ? effUntilRaw : null;
    if (effUntil && effUntil < effFrom) {
      errors.push({ row: lineNo, message: "종료일이 시작일보다 빠릅니다." });
      continue;
    }

    records.push({
      name,
      room_id: room.id,
      weekday,
      start_time: startTime,
      end_time: endTime,
      effective_from: effFrom,
      effective_until: effUntil,
      notes: notes || null,
    });
  }

  if (errors.length > 0) return { ok: false, count: 0, errors };

  // display_order: 같은 weekday 내 MAX+1 부터 순차. 같은 요일 여러개면 +1, +2 …
  const orderByWeekday = new Map<number, number>();
  for (const wd of new Set(records.map((r) => r.weekday))) {
    const { data: maxRow } = await supabase
      .from("fixed_events")
      .select("display_order")
      .eq("weekday", wd)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderByWeekday.set(wd, (maxRow?.display_order ?? -1) + 1);
  }
  const toInsert = records.map((r) => {
    const next = orderByWeekday.get(r.weekday) ?? 0;
    orderByWeekday.set(r.weekday, next + 1);
    return { ...r, display_order: next };
  });

  const { error } = await supabase.from("fixed_events").insert(toInsert);
  if (error) {
    return { ok: false, count: 0, errors: [{ row: 1, message: error.message }] };
  }

  revalidateAll();
  return { ok: true, count: toInsert.length };
}

export async function toggleFixedEventActive(
  id: string,
  active: boolean,
): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("fixed_events")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}
