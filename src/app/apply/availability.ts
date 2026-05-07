"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { expandFixedEvents } from "@/lib/recurrence";
import { getFixedEvents } from "@/lib/repo";
import type { FixedEventInstance } from "@/lib/recurrence";

export type ExistingSlot = {
  id: string;
  start_at: string; // ISO
  end_at: string; // ISO
  status: string;
  dept_name: string | null;
  is_recurring: boolean;
  is_fixed: boolean;
  /** 고정 행사면 행사 이름, 일반 신청이면 부서명 fallback */
  label: string;
};

type ReservationRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  series_id: string | null;
  dept: { name: string } | null;
};

/**
 * 신청 폼에서 호실+날짜가 결정되는 즉시 그 날 이미 잡힌 일정을 보여주기 위한 lookup.
 * pending/approved 활성 신청 + 고정 행사 둘 다 포함. 시작시간 오름차순 정렬.
 */
export async function fetchRoomAvailability(
  roomId: string,
  date: string,
): Promise<ExistingSlot[]> {
  if (!roomId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd = `${date}T23:59:59+09:00`;

  const supabase = createServiceClient();
  const reservationsP = supabase
    .from("reservations")
    .select(
      `id, start_at, end_at, status, series_id,
       dept:departments (name)`,
    )
    .eq("room_id", roomId)
    .lt("start_at", dayEnd)
    .gt("end_at", dayStart)
    .in("status", ["pending", "approved"])
    .order("start_at");
  const fixedP = getFixedEvents();

  const [{ data: reservations }, fixed] = await Promise.all([
    reservationsP,
    fixedP,
  ]);

  const rRows = (reservations ?? []) as unknown as ReservationRow[];
  const fixedAll = fixed ?? [];
  const fixedToday: FixedEventInstance[] = expandFixedEvents(
    fixedAll,
    date,
    date,
  ).filter((e) => e.room_id === roomId);

  const slots: ExistingSlot[] = [
    ...rRows.map((r) => ({
      id: r.id,
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      dept_name: r.dept?.name ?? null,
      is_recurring: r.series_id != null,
      is_fixed: false,
      label: r.dept?.name ?? "신청 일정",
    })),
    ...fixedToday.map((e) => ({
      id: e.id,
      start_at: e.start_at,
      end_at: e.end_at,
      status: "approved", // 고정 행사는 항상 점유
      dept_name: null,
      is_recurring: false,
      is_fixed: true,
      label: e.name,
    })),
  ];

  // 시작 시각 오름차순
  slots.sort((a, b) => a.start_at.localeCompare(b.start_at));

  return slots;
}
