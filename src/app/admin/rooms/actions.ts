"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Result = { error?: string };

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

export async function createRoom(floorId: string): Promise<Result> {
  if (!floorId) return { error: "층이 선택되지 않았습니다." };
  const supabase = createServiceClient();

  // 같은 층 호실 개수로 기본 이름과 위치 결정 (겹치지 않게 살짝 어긋나게)
  const { count } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("floor_id", floorId);
  const idx = count ?? 0;

  const name = `새 호실 ${idx + 1}`;
  const offset = idx * 3; // 새 박스가 약간씩 어긋나서 보이게
  const baseX = clampPct(40 + offset);
  const baseY = clampPct(40 + offset);

  const { error } = await supabase.from("rooms").insert({
    floor_id: floorId,
    name,
    map_x: baseX,
    map_y: baseY,
    map_w: 18,
    map_h: 14,
    display_order: idx,
    active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/rooms");
  revalidatePath("/");
  return {};
}

export async function updateRoomLayout(
  id: string,
  patch: { map_x?: number; map_y?: number; map_w?: number; map_h?: number },
): Promise<Result> {
  const supabase = createServiceClient();
  const update: Record<string, number> = {};
  if (patch.map_x != null) update.map_x = clampPct(patch.map_x);
  if (patch.map_y != null) update.map_y = clampPct(patch.map_y);
  if (patch.map_w != null) update.map_w = Math.max(4, Math.min(100, patch.map_w));
  if (patch.map_h != null) update.map_h = Math.max(4, Math.min(100, patch.map_h));
  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase.from("rooms").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/rooms");
  revalidatePath("/");
  return {};
}

export async function updateRoomMeta(
  id: string,
  patch: { name?: string; capacity?: number | null },
): Promise<Result> {
  const supabase = createServiceClient();
  const update: Record<string, unknown> = {};
  if (patch.name != null) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { error: "이름을 입력해주세요." };
    update.name = trimmed;
  }
  if (patch.capacity !== undefined) update.capacity = patch.capacity;
  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase.from("rooms").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/rooms");
  revalidatePath("/");
  return {};
}

export async function deleteRoom(id: string): Promise<Result> {
  const supabase = createServiceClient();
  // 예약이 있으면 hard delete 막힘 → soft delete (active=false)로 폴백
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) {
    const { error: e2 } = await supabase
      .from("rooms")
      .update({ active: false })
      .eq("id", id);
    if (e2) return { error: e2.message };
  }

  revalidatePath("/admin/rooms");
  revalidatePath("/");
  return {};
}
