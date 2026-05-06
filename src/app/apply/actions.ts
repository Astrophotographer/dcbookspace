"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { ApprovalRoute, ApprovalStep } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

type SubmitResult = { id?: string; error?: string };
type Result = { error?: string };

async function verifyOwner(
  reservationId: string,
  ownerName: string,
  ownerPhone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownerName || !ownerPhone) {
    return { ok: false, error: "본인 확인 정보가 없습니다." };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, applicant:users!applicant_id (name, phone)")
    .eq("id", reservationId)
    .single();
  if (error || !data) return { ok: false, error: "신청서를 찾을 수 없습니다." };
  const applicant = (
    data as unknown as { applicant: { name: string; phone: string | null } }
  ).applicant;
  if (
    applicant?.name !== ownerName ||
    (applicant?.phone ?? "") !== ownerPhone
  ) {
    return { ok: false, error: "본인이 작성한 신청서가 아닙니다." };
  }
  return { ok: true };
}

export type ConflictInfo = {
  id: string;
  purpose: string;
  start_at: string;
  end_at: string;
  status: "pending" | "approved";
};

// 같은 호실, 시간 겹치는 신청을 조회한다.
// trigger 와 동일하게 (status in pending/approved) + 반열린 [) 시간 겹침 기준.
// excludeId: 수정 모드에서 자기 자신과의 충돌을 제외할 때 사용.
export async function findRoomConflicts(
  roomId: string,
  startAt: string,
  endAt: string,
  excludeId?: string,
): Promise<ConflictInfo[]> {
  if (!roomId || !startAt || !endAt) return [];
  const supabase = createServiceClient();
  let q = supabase
    .from("reservations")
    .select("id, purpose, start_at, end_at, status")
    .eq("room_id", roomId)
    .in("status", ["pending", "approved"])
    .lt("start_at", endAt)   // 다른 예약 시작 < 우리의 끝
    .gt("end_at", startAt);  // 다른 예약 끝   > 우리의 시작
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return (data as ConflictInfo[] | null) ?? [];
}

function pickRoute(routes: ApprovalRoute[], attendees: number, external: boolean) {
  // 특수 조건: 50명 이상 OR 외부행사 → 4단계
  if (attendees >= 50 || external) {
    const special = routes.find(
      (r) =>
        Array.isArray(r.steps) &&
        (r.steps as ApprovalStep[]).some((s) => s.role === "senior_pastor"),
    );
    if (special) return special;
  }
  return routes.find((r) => r.is_default) ?? routes[0];
}

export async function submitApplication(
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SubmitResult> {
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

  if (!applicantName || !applicantPhone || !deptId || !roomId || !date || !startTime || !endTime || !purpose) {
    return { error: "필수 입력값이 빠졌습니다." };
  }

  // 과거 날짜 차단 (KST 기준)
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayKey) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) {
    return { error: "종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다." };
  }

  // KST 기준으로 timestamp 만들기 (다일 예약 지원)
  const startAt = `${date}T${startTime}:00+09:00`;
  const endAt = `${endDate}T${endTime}:00+09:00`;

  if (new Date(endAt) <= new Date(startAt)) {
    return { error: "종료 시간이 시작 시간보다 빠릅니다." };
  }

  // 1) 신청자 upsert (이름+휴대폰으로 식별)
  const { data: existing } = await supabase
    .from("users")
    .select("*")
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

  // 2) 결재선 결정
  const { data: routes, error: routesErr } = await supabase
    .from("approval_routes")
    .select("*");
  if (routesErr || !routes?.length)
    return { error: routesErr?.message ?? "결재선이 설정되지 않았습니다." };
  const route = pickRoute(routes as ApprovalRoute[], attendeeCount, isExternal);

  // 3) reservation 생성. 충돌이 있어도 forceOverlap=true 면 trigger 우회.
  const { data: res, error: resErr } = await supabase
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
      status: "pending",
      route_id: route.id,
      current_step: 1,
      force_overlap: options?.forceOverlap ?? false,
    })
    .select("id")
    .single();
  if (resErr || !res) {
    if (resErr?.message?.includes("이미 예약")) return { error: resErr.message };
    return { error: resErr?.message ?? "신청 실패" };
  }

  // 4) approvals 행 생성 (각 단계별)
  const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
    reservation_id: res.id,
    step_order: s.order,
    role: s.role,
  }));
  const { error: apErr } = await supabase.from("approvals").insert(apprRows);
  if (apErr) return { error: apErr.message };

  revalidatePath("/");
  return { id: res.id };
}

/**
 * 본인이 작성한 신청서를 수정한다.
 *
 * 안전 규칙:
 *  - status='pending' 이고 결재가 첫 단계에서 멈춰 있을 때만 허용
 *    (이미 결재가 진행됐으면 수정 시 결재자가 본 정보가 달라져 위험)
 *  - 인원/외부행사 변경으로 결재선이 바뀌면 approvals 를 새로 만든다
 *  - 본인 검증: 신청서의 applicant.name + applicant.phone 일치 여부
 */
export async function updateApplication(
  reservationId: string,
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SubmitResult> {
  const supabase = createServiceClient();

  const ownerName = String(fd.get("owner_name") ?? "").trim();
  const ownerPhone = String(fd.get("owner_phone") ?? "").trim();
  const verify = await verifyOwner(reservationId, ownerName, ownerPhone);
  if (!verify.ok) return { error: verify.error };

  // 현재 상태 확인
  const { data: cur, error: e0 } = await supabase
    .from("reservations")
    .select("status, current_step, route_id, applicant_id")
    .eq("id", reservationId)
    .single();
  if (e0 || !cur) return { error: e0?.message ?? "신청서를 찾을 수 없습니다." };
  if (cur.status !== "pending" || cur.current_step !== 1) {
    return {
      error:
        "이미 결재가 진행된 신청서는 수정할 수 없습니다. 필요하면 삭제 후 다시 작성해주세요.",
    };
  }

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

  if (!deptId || !roomId || !date || !startTime || !endTime || !purpose) {
    return { error: "필수 입력값이 빠졌습니다." };
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayKey) {
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

  // 결재선 재계산: 인원/외부행사 변경으로 단계 수가 달라질 수 있음
  const { data: routes, error: routesErr } = await supabase
    .from("approval_routes")
    .select("*");
  if (routesErr || !routes?.length)
    return { error: routesErr?.message ?? "결재선이 설정되지 않았습니다." };
  const route = pickRoute(routes as ApprovalRoute[], attendeeCount, isExternal);
  const routeChanged = route.id !== cur.route_id;

  // reservation 본문 업데이트 (시간 충돌은 trigger 가 막음)
  const { error: upErr } = await supabase
    .from("reservations")
    .update({
      room_id: roomId,
      dept_id: deptId,
      start_at: startAt,
      end_at: endAt,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      route_id: route.id,
      current_step: 1,
      status: "pending",
      force_overlap: options?.forceOverlap ?? false,
    })
    .eq("id", reservationId);
  if (upErr) {
    if (upErr.message?.includes("이미 예약")) return { error: upErr.message };
    return { error: upErr.message };
  }

  // 결재선이 바뀌면 approvals 재생성
  if (routeChanged) {
    const { error: dErr } = await supabase
      .from("approvals")
      .delete()
      .eq("reservation_id", reservationId);
    if (dErr) return { error: dErr.message };
    const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
      reservation_id: reservationId,
      step_order: s.order,
      role: s.role,
    }));
    const { error: insErr } = await supabase.from("approvals").insert(apprRows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/reservations/${reservationId}/print`);
  return { id: reservationId };
}

export async function deleteReservation(
  reservationId: string,
  ownerName: string,
  ownerPhone: string,
): Promise<Result> {
  const verify = await verifyOwner(reservationId, ownerName, ownerPhone);
  if (!verify.ok) return { error: verify.error };

  const supabase = createServiceClient();
  // approvals 는 reservation cascade 로 같이 삭제됨
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", reservationId);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/reservations");
  return {};
}
