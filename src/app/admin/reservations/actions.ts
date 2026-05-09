"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { emitReservationEventAfter } from "@/lib/webhook";

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
  emitReservationEventAfter("reservation.approved", id, {
    admin_forced: true,
  });
  return { ok: true };
}

/**
 * 반려된 신청서를 다시 결재 진행 상태로 되살림.
 *
 * - 'rejected' 표시였던 결재 단계들을 'pending' 으로 복구 (signed_at, comment 초기화)
 * - 'approved' / 'skipped' 표시는 그대로 유지 (이미 통과·건너뜀 이력 보존)
 * - 신청서 status → 'pending', current_step = 가장 낮은 pending step
 * - 모든 단계가 이미 'approved' (사후 강제 반려 케이스) 면 reservation status 만 'pending' 으로
 *   바꾸면 displayStatus 가 자동으로 '결재 진행중' 으로 표시됨
 */
export async function reviveReservation(id: string): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };
  const supabase = createServiceClient();

  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", id)
    .single();
  if (e0 || !r) return { error: "신청서를 찾을 수 없습니다." };
  if (r.status !== "rejected")
    return { error: "반려 상태인 신청서만 되살릴 수 있습니다." };

  // 반려된 결재 단계 → pending 으로 복구
  const { error: e1 } = await supabase
    .from("approvals")
    .update({
      status: "pending",
      signed_at: null,
      comment: null,
      approver_id: null,
    })
    .eq("reservation_id", id)
    .eq("status", "rejected");
  if (e1) return { error: e1.message };

  // 다음 처리 단계: 가장 낮은 pending step_order 찾기
  const { data: pendingApprovals, error: e2 } = await supabase
    .from("approvals")
    .select("step_order")
    .eq("reservation_id", id)
    .eq("status", "pending")
    .order("step_order", { ascending: true })
    .limit(1);
  if (e2) return { error: e2.message };

  // pending 이 하나도 없는 경우(=모든 단계가 approved 인 사후 강제 반려 후 revive)
  // current_step 은 마지막 step + 1 정도로 두면 됨. 어차피 approvals 다 통과 상태라
  // status='pending' 만으로 displayStatus 가 'in_review' 로 잡아줌.
  const nextStep = pendingApprovals?.[0]?.step_order ?? 9999;

  const { error: e3 } = await supabase
    .from("reservations")
    .update({ status: "pending", current_step: nextStep })
    .eq("id", id);
  if (e3) return { error: e3.message };

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath(`/reservations/${id}`);
  return { ok: true };
}

/**
 * 결재 단계와 무관하게 즉시 반려.
 * - pending 상태: 미처리 approvals 를 'rejected' 로 표시 (강제 반려 표식)
 * - approved 상태: 이미 예약 완료된 건도 사후 강제 반려 가능. 기존 approvals 는
 *   'approved' 그대로 두고 (감사 추적), reservation 상태만 'rejected' 로 전환.
 *   webhook 이벤트의 admin_forced=true 로 사후 강제 반려임을 외부에 알림.
 */
export async function forceReject(id: string): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };
  const supabase = createServiceClient();

  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", id)
    .single();
  if (e0 || !r) return { error: "신청서를 찾을 수 없습니다." };
  if (r.status === "rejected") return { error: "이미 반려된 신청입니다." };
  if (r.status === "cancelled") return { error: "취소된 신청입니다." };

  const { error: e1 } = await supabase
    .from("approvals")
    .update({
      status: "rejected",
      signed_at: new Date().toISOString(),
      comment: "관리자 강제 반려",
    })
    .eq("reservation_id", id)
    .eq("status", "pending");
  if (e1) return { error: e1.message };

  const { error: e2 } = await supabase
    .from("reservations")
    .update({ status: "rejected" })
    .eq("id", id);
  if (e2) return { error: e2.message };

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath(`/reservations/${id}`);
  emitReservationEventAfter("reservation.rejected", id, {
    admin_forced: true,
  });
  return { ok: true };
}
