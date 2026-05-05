"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { ApprovalRoute, ApprovalStep } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

type SubmitResult = { id?: string; error?: string };

export type ConflictInfo = {
  id: string;
  purpose: string;
  start_at: string;
  end_at: string;
  status: "pending" | "approved";
};

// 같은 호실, 시간 겹치는 신청을 조회한다.
// trigger 와 동일하게 (status in pending/approved) + 반열린 [) 시간 겹침 기준.
export async function findRoomConflicts(
  roomId: string,
  startAt: string,
  endAt: string,
): Promise<ConflictInfo[]> {
  if (!roomId || !startAt || !endAt) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, purpose, start_at, end_at, status")
    .eq("room_id", roomId)
    .in("status", ["pending", "approved"])
    .lt("start_at", endAt)   // 다른 예약 시작 < 우리의 끝
    .gt("end_at", startAt);  // 다른 예약 끝   > 우리의 시작
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
