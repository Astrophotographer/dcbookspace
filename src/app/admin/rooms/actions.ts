"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Building, Floor } from "@/lib/supabase/types";

type Result<T = unknown> = T & { error?: string };

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

function revalidateRoomsAndPublic() {
  revalidatePath("/admin/rooms");
  revalidatePath("/apply");
  revalidatePath("/");
}

// Postgres unique-violation 에러를 사용자 친화 메시지로 변환
function mapDbError(message: string | undefined, ctx: "building" | "floor"): string {
  if (!message) return "저장에 실패했습니다.";
  if (message.includes("duplicate") || message.includes("unique")) {
    return ctx === "building"
      ? "같은 이름의 건물이 이미 있습니다."
      : "같은 층 라벨이 이미 있습니다.";
  }
  return message;
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
  patch: { name?: string },
): Promise<Result> {
  const supabase = createServiceClient();
  const update: Record<string, unknown> = {};
  if (patch.name != null) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { error: "이름을 입력해주세요." };
    update.name = trimmed;
  }
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

// =====================================================
// 건물 (Building) CRUD
// =====================================================

export async function createBuilding(
  name: string,
): Promise<Result<{ building?: Building }>> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "건물 이름을 입력해주세요." };

  const supabase = createServiceClient();
  const { data: maxRow } = await supabase
    .from("buildings")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("buildings")
    .insert({ name: trimmed, display_order: nextOrder })
    .select("*")
    .single();
  if (error) return { error: mapDbError(error.message, "building") };

  revalidateRoomsAndPublic();
  return { building: data as Building };
}

export async function renameBuilding(id: string, name: string): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "건물 이름을 입력해주세요." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("buildings")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) return { error: mapDbError(error.message, "building") };

  revalidateRoomsAndPublic();
  return {};
}

export async function deleteBuilding(id: string): Promise<Result> {
  const supabase = createServiceClient();

  // 이 건물 하위 호실에 신청 이력 있으면 거부 (FK on delete restrict)
  const { data: floorRows, error: ef } = await supabase
    .from("floors")
    .select("id")
    .eq("building_id", id);
  if (ef) return { error: ef.message };
  const floorIds = (floorRows ?? []).map((f) => f.id);
  if (floorIds.length > 0) {
    const { data: roomRows, error: er } = await supabase
      .from("rooms")
      .select("id")
      .in("floor_id", floorIds);
    if (er) return { error: er.message };
    const roomIds = (roomRows ?? []).map((r) => r.id);
    if (roomIds.length > 0) {
      const { count, error: ec } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .in("room_id", roomIds);
      if (ec) return { error: ec.message };
      if ((count ?? 0) > 0) {
        return {
          error: `이 건물에 신청 이력이 있는 호실이 ${count}건 있어 삭제할 수 없습니다. 호실 관리에서 먼저 정리해 주세요.`,
        };
      }
    }
  }

  // floors → rooms 까지 ON DELETE CASCADE 로 자동 정리
  const { error } = await supabase.from("buildings").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateRoomsAndPublic();
  return {};
}

// =====================================================
// 층 (Floor) CRUD
// =====================================================

export async function createFloor(
  buildingId: string,
  label: string,
): Promise<Result<{ floor?: Floor }>> {
  if (!buildingId) return { error: "건물이 선택되지 않았습니다." };
  const trimmed = label.trim();
  if (!trimmed) return { error: "층 라벨을 입력해주세요." };

  const supabase = createServiceClient();
  const { data: maxRow } = await supabase
    .from("floors")
    .select("display_order")
    .eq("building_id", buildingId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("floors")
    .insert({
      building_id: buildingId,
      label: trimmed,
      display_order: nextOrder,
    })
    .select("*")
    .single();
  if (error) return { error: mapDbError(error.message, "floor") };

  revalidateRoomsAndPublic();
  return { floor: data as Floor };
}

export async function renameFloor(id: string, label: string): Promise<Result> {
  const trimmed = label.trim();
  if (!trimmed) return { error: "층 라벨을 입력해주세요." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("floors")
    .update({ label: trimmed })
    .eq("id", id);
  if (error) return { error: mapDbError(error.message, "floor") };

  revalidateRoomsAndPublic();
  return {};
}

export async function deleteFloor(id: string): Promise<Result> {
  const supabase = createServiceClient();

  // 이 층 하위 호실에 신청 이력 있으면 거부
  const { data: roomRows, error: er } = await supabase
    .from("rooms")
    .select("id")
    .eq("floor_id", id);
  if (er) return { error: er.message };
  const roomIds = (roomRows ?? []).map((r) => r.id);
  if (roomIds.length > 0) {
    const { count, error: ec } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .in("room_id", roomIds);
    if (ec) return { error: ec.message };
    if ((count ?? 0) > 0) {
      return {
        error: `이 층에 신청 이력이 있는 호실이 ${count}건 있어 삭제할 수 없습니다. 호실 관리에서 먼저 정리해 주세요.`,
      };
    }
  }

  const { error } = await supabase.from("floors").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateRoomsAndPublic();
  return {};
}
