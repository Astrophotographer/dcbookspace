"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  emitReservationEventAfter,
  emitSeriesEventAfter,
} from "@/lib/webhook";
import { getAdminSession, isFullAdmin } from "@/lib/admin-server";
import { isFullAdminSession } from "@/lib/admin-session";
import {
  canGuideElderAccessRow,
  canGuideElderApplySignatures,
} from "@/lib/guide-elder-access";
import { getGuideElderIdsForSession } from "@/lib/guide-elder-identity";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import type {
  ApprovalRoute,
  ApprovalStep,
  TimeBlock,
} from "@/lib/supabase/types";
import {
  computeWeeklyOccurrences,
  MAX_OCCURRENCES,
  MAX_RESERVATIONS_PER_SERIES,
  validateTimeBlocks,
} from "@/lib/recurrence";

type Result = { error?: string; ok?: true };
type SubmitResult = { id?: string; error?: string };

async function fullAdminError(): Promise<string | null> {
  return (await isFullAdmin()) ? null : "전체 관리자 권한이 필요합니다.";
}

type SignatureDept = {
  id: string;
  elder_id: string | null;
  dept_head_signature_data_url: string | null;
  elder_signature_data_url: string | null;
  elder?: { name: string | null } | { name: string | null }[] | null;
};

type CompleteSignatureDept = SignatureDept & {
  dept_head_signature_data_url: string;
  elder_signature_data_url: string;
};

type ReservationSignatureRow = {
  id: string;
  dept_id: string | null;
  status: string;
  current_step: number;
  route: Pick<ApprovalRoute, "steps"> | null;
  dept: SignatureDept | null;
};

type ApplySignatureOptions = {
  confirmOutsideDept?: boolean;
};

function hasCompleteSignatures(
  source: SignatureDept | null,
): source is CompleteSignatureDept {
  return Boolean(
    source?.dept_head_signature_data_url && source.elder_signature_data_url,
  );
}

function asCompleteSignatureDept(source: unknown): CompleteSignatureDept | null {
  const dept = source as SignatureDept | null;
  return hasCompleteSignatures(dept) ? dept : null;
}

function getSignatureElderName(source: SignatureDept | null): string | null {
  const elder = source?.elder;
  if (!elder) return null;
  return Array.isArray(elder) ? elder[0]?.name ?? null : elder.name;
}

async function findCompleteSignatureSource(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  guideElderIds: readonly string[] = [],
): Promise<CompleteSignatureDept | null> {
  const select =
    "id, elder_id, dept_head_signature_data_url, elder_signature_data_url, elder:users!elder_id (name)";
  const baseQuery = () =>
    supabase
      .from("departments")
      .select(select)
      .not("dept_head_signature_data_url", "is", null)
      .not("elder_signature_data_url", "is", null)
      .order("display_order", { ascending: true })
      .limit(1);

  const ownIds = guideElderIds.length ? guideElderIds : [userId];
  const { data: ownDept } = await baseQuery()
    .in("elder_id", ownIds)
    .maybeSingle();
  const completeOwnDept = asCompleteSignatureDept(ownDept);
  if (completeOwnDept) return completeOwnDept;

  const { data: anyDept } = await baseQuery().maybeSingle();
  return asCompleteSignatureDept(anyDept);
}

export async function applyReservationSignatures(
  id: string,
  options: ApplySignatureOptions = {},
): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };

  const session = await getAdminSession();
  if (!session) return { error: "로그인이 필요합니다." };

  const supabase = createServiceClient();
  const { data, error: e0 } = await supabase
    .from("reservations")
    .select(
      `id, dept_id, status, current_step,
       route:approval_routes (steps),
       dept:departments (
         id, elder_id, dept_head_signature_data_url, elder_signature_data_url,
         elder:users!elder_id (name)
       )`,
    )
    .eq("id", id)
    .single();
  if (e0 || !data) return { error: "신청서를 찾을 수 없습니다." };

  const row = data as unknown as ReservationSignatureRow;
  const dept = row.dept;
  if (!dept) return { error: "신청서에 연결된 부서가 없습니다." };

  const fullAdmin = isFullAdminSession(session);
  const guideElderIds =
    !fullAdmin && session.kind === "user"
      ? await getGuideElderIdsForSession(supabase, session)
      : [];
  const ownDept = canGuideElderApplySignatures(row, session, guideElderIds);

  if (
    !fullAdmin &&
    !canGuideElderAccessRow(row, session)
  ) {
    return {
      error: "차장 결재 전 신청서만 확인할 수 있습니다.",
    };
  }

  if (!fullAdmin && !ownDept && !options.confirmOutsideDept) {
    return { error: "담당부서가 아닌데도 확인하시겠습니까?" };
  }

  const source = hasCompleteSignatures(dept)
    ? dept
    : !fullAdmin && session.kind === "user"
      ? await findCompleteSignatureSource(
          supabase,
          session.userId,
          guideElderIds,
        )
      : null;

  if (!source) {
    return { error: "등록된 부서장과 지도장로 사인 세트가 없습니다." };
  }

  const elderName =
    session.kind === "user"
      ? session.name
      : getSignatureElderName(source) ?? getSignatureElderName(dept);

  const { error: e1 } = await supabase
    .from("reservations")
    .update({
      signature_snapshot: {
        dept_id: row.dept_id,
        signature_source_dept_id: source.id,
        outside_dept_confirmed: !fullAdmin && !ownDept,
        dept_head_signature_data_url: source.dept_head_signature_data_url,
        elder_signature_data_url: source.elder_signature_data_url,
        elder_name: elderName,
      },
      signature_snapshot_at: new Date().toISOString(),
      signature_snapshot_by: session.kind === "user" ? session.userId : null,
    })
    .eq("id", id);
  if (e1) return { error: e1.message };

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath(`/reservations/${id}/print`);
  return { ok: true };
}

export async function clearReservationSignatures(id: string): Promise<Result> {
  if (!id) return { error: "잘못된 요청입니다." };

  const session = await getAdminSession();
  if (!session) return { error: "로그인이 필요합니다." };

  const supabase = createServiceClient();
  const { data, error: e0 } = await supabase
    .from("reservations")
    .select(
      `id, dept_id, status, current_step,
       route:approval_routes (steps),
       dept:departments (id, elder_id)`,
    )
    .eq("id", id)
    .single();
  if (e0 || !data) return { error: "신청서를 찾을 수 없습니다." };

  const row = data as unknown as ReservationSignatureRow;
  const fullAdmin = isFullAdminSession(session);
  if (!fullAdmin && !canGuideElderAccessRow(row, session)) {
    return { error: "차장 결재 전 신청서만 취소할 수 있습니다." };
  }

  const { error: e1 } = await supabase
    .from("reservations")
    .update({
      signature_snapshot: null,
      signature_snapshot_at: null,
      signature_snapshot_by: null,
    })
    .eq("id", id);
  if (e1) return { error: e1.message };

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath(`/reservations/${id}`);
  revalidatePath(`/reservations/${id}/print`);
  return { ok: true };
}

/**
 * 신청서 hard delete. approvals는 ON DELETE CASCADE 되어 있어 같이 삭제됨.
 */
export async function deleteReservation(id: string): Promise<Result> {
  const authError = await fullAdminError();
  if (authError) return { error: authError };
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
  const authError = await fullAdminError();
  if (authError) return { error: authError };
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
  const authError = await fullAdminError();
  if (authError) return { error: authError };
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
  const authError = await fullAdminError();
  if (authError) return { error: authError };
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

/**
 * 관리자가 종이 신청서를 보고 직접 등록하는 셀프-등록 흐름.
 *
 * 일반 신청과 차이:
 *  - 결재 단계 일체 생략 → reservation.status 곧장 'approved'
 *  - approvals 행은 audit 용으로 'skipped' + comment="관리자 직접 등록" 으로 기록
 *  - QR 결재 흐름 안 거치므로 알림 푸시도 forced 강제 등록과 동일하게 admin_forced=true 로 발행
 *
 * 충돌 처리: forceOverlap=true 면 trigger 우회. 미지정 시 trigger 에러를
 * 메시지 그대로 반환해 폼에서 사용자에게 다시 묻는다.
 */
export async function submitAdminReservation(
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SubmitResult> {
  const authError = await fullAdminError();
  if (authError) return { error: authError };
  const supabase = createServiceClient();

  const applicantName = String(fd.get("applicant_name") ?? "").trim();
  const applicantPhone = String(fd.get("applicant_phone") ?? "").trim();
  const deptId = String(fd.get("dept_id") ?? "");
  const roomId = String(fd.get("room_id") ?? "");
  const date = String(fd.get("date") ?? "");
  const endDate = String(fd.get("end_date") ?? date) || date;
  const startTime = String(fd.get("start_time") ?? "");
  const endTime = String(fd.get("end_time") ?? "");
  const purpose = String(fd.get("purpose") ?? "").trim();
  const attendeeCount = Number(fd.get("attendee_count") ?? 0);
  const isExternal = fd.get("is_external") === "on";
  const notes = String(fd.get("notes") ?? "").trim() || null;

  if (
    !applicantName ||
    !applicantPhone ||
    !deptId ||
    !roomId ||
    !date ||
    !startTime ||
    !endTime ||
    !purpose
  ) {
    return { error: "필수 입력값이 빠졌습니다." };
  }
  if (!isValidPhone(applicantPhone)) {
    return { error: PHONE_INVALID_MESSAGE };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) {
    return { error: "종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다." };
  }

  const startAt = `${date}T${startTime}:00+09:00`;
  const endAt = `${endDate}T${endTime}:00+09:00`;
  if (new Date(endAt) <= new Date(startAt)) {
    return { error: "종료 시간이 시작 시간보다 빠릅니다." };
  }

  // 1) 신청자 upsert (이름+휴대폰)
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("name", applicantName)
    .eq("phone", applicantPhone)
    .maybeSingle();
  let applicantId: string;
  if (existing) {
    applicantId = existing.id;
  } else {
    const { data: created, error: e1 } = await supabase
      .from("users")
      .insert({
        name: applicantName,
        phone: applicantPhone,
        role: "applicant",
        dept_id: deptId,
      })
      .select("id")
      .single();
    if (e1 || !created) return { error: e1?.message ?? "사용자 등록 실패" };
    applicantId = created.id;
  }

  // 2) route_id 가 NOT NULL 이라 기본 결재선을 attach. 단계 자체는 곧장 skipped.
  const { data: routes, error: rErr } = await supabase
    .from("approval_routes")
    .select("*");
  if (rErr || !routes?.length)
    return { error: rErr?.message ?? "결재선이 설정되지 않았습니다." };
  const route =
    (routes as ApprovalRoute[]).find((r) => r.is_default) ??
    (routes as ApprovalRoute[])[0];

  // 3) reservation insert — 곧바로 approved. current_step 은 마지막 단계+1 로 둬
  //    진행도 UI 가 "결재 완료" 상태로 자연스럽게 보이도록.
  const lastStep = (route.steps as ApprovalStep[]).reduce(
    (m, s) => Math.max(m, s.order),
    0,
  );
  const { data: res, error: insErr } = await supabase
    .from("reservations")
    .insert({
      room_id: roomId,
      applicant_id: applicantId,
      dept_id: deptId,
      start_at: startAt,
      end_at: endAt,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      status: "approved",
      route_id: route.id,
      current_step: lastStep + 1,
      force_overlap: options?.forceOverlap ?? false,
    })
    .select("id")
    .single();
  if (insErr || !res) {
    if (insErr?.message?.includes("이미 예약")) return { error: insErr.message };
    return { error: insErr?.message ?? "신청 등록 실패" };
  }

  // 4) approvals — 단계별로 skipped 행 만들어 audit 흐름 일관성 유지
  const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
    reservation_id: res.id,
    step_order: s.order,
    role: s.role,
    status: "skipped" as const,
    signed_at: new Date().toISOString(),
    comment: "관리자 직접 등록",
  }));
  const { error: apErr } = await supabase.from("approvals").insert(apprRows);
  if (apErr) return { error: apErr.message };

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  emitReservationEventAfter("reservation.approved", res.id, {
    admin_forced: true,
    admin_self_register: true,
  });
  return { id: res.id };
}

type SeriesSubmitResult = { id?: string; error?: string };

/**
 * 관리자가 종이 시리즈(정기) 신청서를 보고 직접 등록.
 * submitAdminReservation 의 시리즈 버전 — 결재 단계 전부 'skipped' + 곧장 'approved'.
 */
export async function submitAdminSeriesReservation(
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SeriesSubmitResult> {
  const authError = await fullAdminError();
  if (authError) return { error: authError };
  const supabase = createServiceClient();

  const applicantName = String(fd.get("applicant_name") ?? "").trim();
  const applicantPhone = String(fd.get("applicant_phone") ?? "").trim();
  const deptId = String(fd.get("dept_id") ?? "");
  const roomId = String(fd.get("room_id") ?? "");
  const startDate = String(fd.get("start_date") ?? "");
  const endDate = String(fd.get("end_date") ?? startDate);
  const purpose = String(fd.get("purpose") ?? "").trim();
  const attendeeCount = Number(fd.get("attendee_count") ?? 0);
  const isExternal = fd.get("is_external") === "on";
  const notes = String(fd.get("notes") ?? "").trim() || null;

  let timeBlocks: TimeBlock[] = [];
  try {
    timeBlocks = JSON.parse(String(fd.get("time_blocks") ?? "[]"));
  } catch {
    return { error: "시간대 형식이 올바르지 않습니다." };
  }

  if (
    !applicantName ||
    !applicantPhone ||
    !deptId ||
    !roomId ||
    !startDate ||
    !purpose
  ) {
    return { error: "필수 입력값이 빠졌습니다." };
  }
  if (!isValidPhone(applicantPhone)) {
    return { error: PHONE_INVALID_MESSAGE };
  }
  const tbErr = validateTimeBlocks(timeBlocks);
  if (tbErr) return { error: tbErr };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    return { error: "종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다." };
  }

  const weekday = new Date(`${startDate}T12:00:00+09:00`).getDay();
  const occurrences = computeWeeklyOccurrences(startDate, endDate, weekday);
  if (occurrences.length === 0)
    return { error: "해당 기간 안에 회차가 없습니다." };
  if (occurrences.length >= MAX_OCCURRENCES)
    return { error: `회차 수가 너무 많습니다 (최대 ${MAX_OCCURRENCES}회).` };
  const totalRows = occurrences.length * timeBlocks.length;
  if (totalRows > MAX_RESERVATIONS_PER_SERIES) {
    return {
      error: `회차×시간대 합계가 너무 많습니다 (최대 ${MAX_RESERVATIONS_PER_SERIES}개).`,
    };
  }

  // 1) 신청자 upsert
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("name", applicantName)
    .eq("phone", applicantPhone)
    .maybeSingle();
  let applicantId: string;
  if (existing) {
    applicantId = existing.id;
  } else {
    const { data: created, error: e1 } = await supabase
      .from("users")
      .insert({
        name: applicantName,
        phone: applicantPhone,
        role: "applicant",
        dept_id: deptId,
      })
      .select("id")
      .single();
    if (e1 || !created) return { error: e1?.message ?? "사용자 등록 실패" };
    applicantId = created.id;
  }

  // 2) FK 채우기 위한 기본 결재선
  const { data: routes, error: rErr } = await supabase
    .from("approval_routes")
    .select("*");
  if (rErr || !routes?.length)
    return { error: rErr?.message ?? "결재선이 설정되지 않았습니다." };
  const route =
    (routes as ApprovalRoute[]).find((r) => r.is_default) ??
    (routes as ApprovalRoute[])[0];
  const lastStep = (route.steps as ApprovalStep[]).reduce(
    (m, s) => Math.max(m, s.order),
    0,
  );

  // 3) 시리즈 본문 — 곧장 approved
  const { data: series, error: sErr } = await supabase
    .from("reservation_series")
    .insert({
      applicant_id: applicantId,
      dept_id: deptId,
      room_id: roomId,
      weekday,
      start_date: startDate,
      end_date: endDate,
      time_blocks: timeBlocks,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      status: "approved",
      route_id: route.id,
      current_step: lastStep + 1,
    })
    .select("id")
    .single();
  if (sErr || !series) return { error: sErr?.message ?? "시리즈 생성 실패" };

  // 4) 시리즈 단위 approvals — 모두 skipped
  const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
    series_id: series.id,
    step_order: s.order,
    role: s.role,
    status: "skipped" as const,
    signed_at: new Date().toISOString(),
    comment: "관리자 직접 등록",
  }));
  const { error: apErr } = await supabase.from("approvals").insert(apprRows);
  if (apErr) return { error: apErr.message };

  // 5) 회차 reservations — approved 로 일괄 insert
  const force = !!options?.forceOverlap;
  const reservationRows = occurrences.flatMap((date) =>
    timeBlocks.map((b) => ({
      room_id: roomId,
      applicant_id: applicantId,
      dept_id: deptId,
      start_at: `${date}T${b.start}:00+09:00`,
      end_at: `${date}T${b.end}:00+09:00`,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      status: "approved" as const,
      route_id: route.id,
      current_step: lastStep + 1,
      force_overlap: force,
      series_id: series.id,
    })),
  );
  const { error: rErr2 } = await supabase
    .from("reservations")
    .insert(reservationRows);
  if (rErr2) {
    await supabase.from("reservation_series").delete().eq("id", series.id);
    if (rErr2.message?.includes("이미 예약")) return { error: rErr2.message };
    return { error: rErr2.message };
  }

  revalidatePath("/");
  revalidatePath("/admin/reservations");
  emitSeriesEventAfter("series.created", series.id);
  return { id: series.id };
}
