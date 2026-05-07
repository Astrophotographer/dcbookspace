"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { FixedEvent } from "@/lib/supabase/types";

type Result<T = unknown> = T & { error?: string };

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
