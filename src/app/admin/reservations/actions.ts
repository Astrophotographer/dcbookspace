"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Result = { error?: string; ok?: true };

/**
 * 신청서 hard delete. approvals는 ON DELETE CASCADE 되어 있어 같이 삭제됨.
 */
export async function deleteReservation(id: string): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };
  const supabase = createServiceClient();

  const { error } = await supabase.from("reservations").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  return { ok: true };
}

/**
 * 결재 단계와 무관하게 즉시 예약 확정.
 * 미처리 approvals는 'skipped'로 표시.
 */
export async function forceReserve(id: string): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };
  const supabase = createServiceClient();

  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", id)
    .single();
  if (e0 || !r) return { error: "신청서를 찾을 수 없습니다." };
  if (r.status === "approved") return { error: "이미 예약 완료된 신청입니다." };
  if (r.status === "cancelled") return { error: "취소된 신청입니다." };

  const { error: e1 } = await supabase
    .from("approvals")
    .update({
      status: "skipped",
      signed_at: new Date().toISOString(),
      comment: "관리자 강제 예약",
    })
    .eq("reservation_id", id)
    .eq("status", "pending");
  if (e1) return { error: e1.message };

  const { error: e2 } = await supabase
    .from("reservations")
    .update({ status: "approved" })
    .eq("id", id);
  if (e2) return { error: e2.message };

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath(`/reservations/${id}`);
  return { ok: true };
}
