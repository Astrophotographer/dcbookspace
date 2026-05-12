"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getPrimaryAdminContact } from "@/lib/repo";
import type {
  ApprovalRoute,
  ApprovalStep,
  FixedEvent,
  TimeBlock,
} from "@/lib/supabase/types";
import {
  computeWeeklyOccurrences,
  MAX_OCCURRENCES,
  MAX_RESERVATIONS_PER_SERIES,
  validateTimeBlocks,
} from "@/lib/recurrence";
import { revalidatePath } from "next/cache";
import {
  emitReservationEventAfter,
  emitSeriesEventAfter,
} from "@/lib/webhook";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import { notifyForcedOverlap } from "@/lib/push";

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
  applicant: { name: string; phone: string | null } | null;
  dept: { name: string } | null;
};

export type FixedEventConflictInfo = {
  id: string;
  name: string;
  weekday: number;
  /** "HH:MM:SS" */
  start_time: string;
  end_time: string;
};

export type AdminContactInfo = {
  name: string;
  phone: string | null;
  role: "admin" | "manager";
};

export type RoomConflictResult = {
  reservations: ConflictInfo[];
  fixedEvents: FixedEventConflictInfo[];
  adminContact: AdminContactInfo | null;
};

/** ISO+09:00 문자열에서 KST 날짜·시간 추출 (오프셋이 이미 +09:00 이라 단순 substring) */
function kstDateTime(iso: string): { date: string; time: string } | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  return { date: m[1], time: m[2] };
}

// 같은 호실, 시간 겹치는 신청 + 고정 행사 + 1차 연락 관리자 정보를 한 번에 조회.
// trigger 와 동일하게 (status in pending/approved) + 반열린 [) 시간 겹침 기준.
// excludeId: 수정 모드에서 자기 자신과의 충돌을 제외할 때 사용.
export async function findRoomConflicts(
  roomId: string,
  startAt: string,
  endAt: string,
  excludeId?: string,
): Promise<RoomConflictResult> {
  const empty: RoomConflictResult = {
    reservations: [],
    fixedEvents: [],
    adminContact: null,
  };
  if (!roomId || !startAt || !endAt) return empty;
  const supabase = createServiceClient();

  // 1) 일반 예약 충돌 — 신청자/부서 정보도 함께 가져와 모달에 노출
  let q = supabase
    .from("reservations")
    .select(
      `id, purpose, start_at, end_at, status,
       applicant:users!applicant_id (name, phone),
       dept:departments (name)`,
    )
    .eq("room_id", roomId)
    .in("status", ["pending", "approved"])
    .lt("start_at", endAt)
    .gt("end_at", startAt);
  if (excludeId) q = q.neq("id", excludeId);
  const { data: resData } = await q;

  // 2) 고정 행사 충돌 — 단일 날짜 신청에 한해 검사
  // (다일 신청은 가운데 날들의 시간 윈도우가 모호해서 MVP 에선 패스)
  let fixedEvents: FixedEventConflictInfo[] = [];
  const sk = kstDateTime(startAt);
  const ek = kstDateTime(endAt);
  if (sk && ek && sk.date === ek.date) {
    const date = sk.date;
    const weekday = new Date(`${date}T00:00:00+09:00`).getDay();
    const startTime = `${sk.time}:00`;
    const endTime = `${ek.time}:00`;
    const { data: fxData } = await supabase
      .from("fixed_events")
      .select(
        "id, name, weekday, start_time, end_time, effective_from, effective_until",
      )
      .eq("room_id", roomId)
      .eq("active", true)
      .eq("weekday", weekday)
      .lte("effective_from", date);
    fixedEvents = ((fxData ?? []) as FixedEvent[])
      .filter((e) => !e.effective_until || e.effective_until >= date)
      .filter((e) => e.start_time < endTime && e.end_time > startTime)
      .map((e) => ({
        id: e.id,
        name: e.name,
        weekday: e.weekday,
        start_time: e.start_time,
        end_time: e.end_time,
      }));
  }

  // 3) 충돌이 있을 때만 관리자 연락처도 같이 반환
  const hasAny = (resData?.length ?? 0) > 0 || fixedEvents.length > 0;
  const adminContact = hasAny ? await getPrimaryAdminContact() : null;

  return {
    reservations: (resData as unknown as ConflictInfo[] | null) ?? [],
    fixedEvents,
    adminContact,
  };
}

// 인원·외부행사와 무관하게 모든 신청은 동일한 default 결재선을 사용 (2026-05-12 정책).
// 이전엔 50명 이상/외부행사면 당회장 단계가 추가되는 특수 route 를 골랐으나,
// 운영 단순화를 위해 단일 결재선으로 통일.
function pickRoute(
  routes: ApprovalRoute[],
  _attendees: number,
  _external: boolean,
) {
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
  if (!isValidPhone(applicantPhone)) {
    return { error: PHONE_INVALID_MESSAGE };
  }

  // 과거 날짜 차단 (KST 기준)
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (date < todayKey) {
    return {
      error:
        "시작 날짜가 지난 날짜입니다. 오늘 이후 날짜로 다시 입력해 주세요.",
    };
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

  // 강제 중복 신청 시 → 기존 신청자 + 관리자에게 푸시 알림 (fire-and-forget)
  if (options?.forceOverlap) {
    void notifyForcedOverlap({
      newReservationId: res.id,
      roomId,
      startAt,
      endAt,
      newApplicantName: applicantName,
      newApplicantId: applicantId,
    }).catch(() => {
      /* ignore — 신청 자체는 성공한 상태 */
    });
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
  emitReservationEventAfter("reservation.created", res.id);
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (date < todayKey) {
    return {
      error:
        "시작 날짜가 지난 날짜입니다. 오늘 이후 날짜로 다시 입력해 주세요.",
    };
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

// =====================================================
// 시리즈(정기 신청) 서버 액션
// =====================================================

export type SeriesOccurrenceConflict = {
  date: string; // YYYY-MM-DD
  blockIndex: number;
  startAt: string;
  endAt: string;
  reservations: ConflictInfo[];
  fixedEvents: FixedEventConflictInfo[];
};

export type SeriesConflictResult = {
  occurrences: SeriesOccurrenceConflict[];
  /** 회차×시간대 합계 (적용될 reservations 행 수) */
  totalRows: number;
  adminContact: AdminContactInfo | null;
};

function buildOccurrenceWindows(
  occurrenceDates: string[],
  timeBlocks: TimeBlock[],
): { date: string; blockIndex: number; startAt: string; endAt: string }[] {
  const out: ReturnType<typeof buildOccurrenceWindows> = [];
  for (const date of occurrenceDates) {
    timeBlocks.forEach((block, blockIndex) => {
      const startAt = `${date}T${block.start}:00+09:00`;
      const endAt = `${date}T${block.end}:00+09:00`;
      out.push({ date, blockIndex, startAt, endAt });
    });
  }
  return out;
}

/**
 * 시리즈 회차들과 시간대 조합 전부에 대한 충돌(예약+고정행사) 검사.
 * 검사 단위: 같은 호실. 효율성 위해 reservations 한 번 + fixed_events 한 번 조회 후
 * 클라이언트(=서버 코드)에서 (date, block) 별로 분류.
 */
export async function findSeriesConflicts(
  roomId: string,
  occurrenceDates: string[],
  timeBlocks: TimeBlock[],
  options?: { excludeSeriesId?: string },
): Promise<SeriesConflictResult> {
  const empty: SeriesConflictResult = {
    occurrences: [],
    totalRows: occurrenceDates.length * timeBlocks.length,
    adminContact: null,
  };
  if (
    !roomId ||
    occurrenceDates.length === 0 ||
    timeBlocks.length === 0
  ) {
    return empty;
  }

  const windows = buildOccurrenceWindows(occurrenceDates, timeBlocks);
  if (windows.length === 0) return empty;

  const minStart = windows.reduce(
    (m, w) => (w.startAt < m ? w.startAt : m),
    windows[0].startAt,
  );
  const maxEnd = windows.reduce(
    (m, w) => (w.endAt > m ? w.endAt : m),
    windows[0].endAt,
  );

  const supabase = createServiceClient();

  // 1) 같은 호실에 minStart~maxEnd 사이 겹치는 reservations
  //    신청자/부서 정보도 함께 — 모달에서 누가 잡았는지 보여주기 위함
  let q = supabase
    .from("reservations")
    .select(
      `id, purpose, start_at, end_at, status, series_id,
       applicant:users!applicant_id (name, phone),
       dept:departments (name)`,
    )
    .eq("room_id", roomId)
    .in("status", ["pending", "approved"])
    .lt("start_at", maxEnd)
    .gt("end_at", minStart);
  if (options?.excludeSeriesId) {
    q = q.neq("series_id", options.excludeSeriesId);
  }
  const { data: rows } = await q;

  // 2) 같은 호실+요일의 active fixed events (모든 회차가 같은 weekday)
  let fixedRows: FixedEvent[] = [];
  if (occurrenceDates.length > 0) {
    const weekday = new Date(`${occurrenceDates[0]}T12:00:00+09:00`).getDay();
    const { data: fxData } = await supabase
      .from("fixed_events")
      .select(
        "id, name, weekday, start_time, end_time, effective_from, effective_until, active",
      )
      .eq("room_id", roomId)
      .eq("active", true)
      .eq("weekday", weekday);
    fixedRows = (fxData ?? []) as FixedEvent[];
  }

  // 3) (date, block) 별로 매칭
  const occurrences: SeriesOccurrenceConflict[] = [];
  const reservationsList = (rows ?? []) as unknown as (ConflictInfo & {
    series_id: string | null;
  })[];

  for (const w of windows) {
    // 윈도우는 +09:00 ISO, 예약은 Supabase 가 UTC ISO 로 돌려줄 수 있어
    // 문자열 직접 비교 대신 Date 로 시각 비교 (오프셋 무관).
    const winStart = Date.parse(w.startAt);
    const winEnd = Date.parse(w.endAt);
    const resHits = reservationsList.filter((r) => {
      const rStart = Date.parse(r.start_at);
      const rEnd = Date.parse(r.end_at);
      return rStart < winEnd && rEnd > winStart;
    });
    const fxHits = fixedRows
      .filter(
        (e) =>
          (!e.effective_from || e.effective_from <= w.date) &&
          (!e.effective_until || e.effective_until >= w.date),
      )
      .filter((e) => {
        const winStart = `${timeBlocks[w.blockIndex].start}:00`;
        const winEnd = `${timeBlocks[w.blockIndex].end}:00`;
        return e.start_time < winEnd && e.end_time > winStart;
      })
      .map<FixedEventConflictInfo>((e) => ({
        id: e.id,
        name: e.name,
        weekday: e.weekday,
        start_time: e.start_time,
        end_time: e.end_time,
      }));

    if (resHits.length > 0 || fxHits.length > 0) {
      occurrences.push({
        date: w.date,
        blockIndex: w.blockIndex,
        startAt: w.startAt,
        endAt: w.endAt,
        reservations: resHits.map<ConflictInfo>((r) => ({
          id: r.id,
          purpose: r.purpose,
          start_at: r.start_at,
          end_at: r.end_at,
          status: r.status,
          applicant: r.applicant,
          dept: r.dept,
        })),
        fixedEvents: fxHits,
      });
    }
  }

  const adminContact =
    occurrences.length > 0 ? await getPrimaryAdminContact() : null;

  return {
    occurrences,
    totalRows: windows.length,
    adminContact,
  };
}

type SeriesSubmitResult = { id?: string; error?: string };

/**
 * 정기 신청 제출. 사용자(이름+전화로 upsert) → reservation_series → approvals →
 * 회차 reservations 일괄 insert.
 */
export async function submitSeriesApplication(
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SeriesSubmitResult> {
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

  // 시간대 배열은 form 에서 JSON 문자열로 직렬화돼 옴
  let timeBlocks: TimeBlock[] = [];
  try {
    const raw = String(fd.get("time_blocks") ?? "[]");
    timeBlocks = JSON.parse(raw);
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

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (startDate < todayKey) {
    return {
      error:
        "시작 날짜가 지난 날짜입니다. 오늘 이후 날짜로 다시 입력해 주세요.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    return { error: "종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다." };
  }

  // 시작 날짜로 weekday 결정 (KST)
  const weekday = new Date(`${startDate}T12:00:00+09:00`).getDay();

  const occurrences = computeWeeklyOccurrences(startDate, endDate, weekday);
  if (occurrences.length === 0) {
    return { error: "해당 기간 안에 회차가 없습니다." };
  }
  if (occurrences.length >= MAX_OCCURRENCES) {
    return {
      error: `회차 수가 너무 많습니다 (최대 ${MAX_OCCURRENCES}회).`,
    };
  }
  const totalRows = occurrences.length * timeBlocks.length;
  if (totalRows > MAX_RESERVATIONS_PER_SERIES) {
    return {
      error: `회차×시간대 합계가 너무 많습니다 (최대 ${MAX_RESERVATIONS_PER_SERIES}개).`,
    };
  }

  // 1) 신청자 upsert
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

  // 3) reservation_series insert
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
      status: "pending",
      route_id: route.id,
      current_step: 1,
    })
    .select("id")
    .single();
  if (sErr || !series) return { error: sErr?.message ?? "시리즈 생성 실패" };

  // 4) approvals (시리즈 단위)
  const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
    series_id: series.id,
    step_order: s.order,
    role: s.role,
  }));
  const { error: apErr } = await supabase.from("approvals").insert(apprRows);
  if (apErr) return { error: apErr.message };

  // 5) 회차 reservations 일괄 insert. 충돌 강제 시 force_overlap=true.
  const force = !!options?.forceOverlap;
  const reservationRows = buildOccurrenceWindows(occurrences, timeBlocks).map(
    (w) => ({
      room_id: roomId,
      applicant_id: applicantId,
      dept_id: deptId,
      start_at: w.startAt,
      end_at: w.endAt,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      status: "pending" as const,
      route_id: route.id,
      current_step: 1,
      force_overlap: force,
      series_id: series.id,
    }),
  );
  const { error: rErr } = await supabase
    .from("reservations")
    .insert(reservationRows);
  if (rErr) {
    // 일부 실패 시 부모 series 롤백
    await supabase.from("reservation_series").delete().eq("id", series.id);
    if (rErr.message?.includes("이미 예약")) return { error: rErr.message };
    return { error: rErr.message };
  }

  revalidatePath("/");
  revalidatePath("/reservations");
  emitSeriesEventAfter("series.created", series.id);
  return { id: series.id };
}

async function verifySeriesOwner(
  seriesId: string,
  ownerName: string,
  ownerPhone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownerName || !ownerPhone) {
    return { ok: false, error: "본인 확인 정보가 없습니다." };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservation_series")
    .select("id, applicant:users!applicant_id (name, phone)")
    .eq("id", seriesId)
    .single();
  if (error || !data)
    return { ok: false, error: "시리즈 신청서를 찾을 수 없습니다." };
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

/**
 * 시리즈 수정. status='pending' AND current_step=1 일 때만 허용.
 * 회차·시간대 변경을 반영하기 위해 자식 reservations + approvals 모두 재생성.
 */
export async function updateSeries(
  seriesId: string,
  fd: FormData,
  options?: { forceOverlap?: boolean },
): Promise<SeriesSubmitResult> {
  const supabase = createServiceClient();

  const ownerName = String(fd.get("owner_name") ?? "").trim();
  const ownerPhone = String(fd.get("owner_phone") ?? "").trim();
  const verify = await verifySeriesOwner(seriesId, ownerName, ownerPhone);
  if (!verify.ok) return { error: verify.error };

  const { data: cur, error: e0 } = await supabase
    .from("reservation_series")
    .select("status, current_step, applicant_id")
    .eq("id", seriesId)
    .single();
  if (e0 || !cur)
    return { error: e0?.message ?? "시리즈 신청서를 찾을 수 없습니다." };
  if (cur.status !== "pending" || cur.current_step !== 1) {
    return {
      error:
        "이미 결재가 진행된 시리즈는 수정할 수 없습니다. 필요하면 삭제 후 다시 작성해 주세요.",
    };
  }

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
  const tbErr = validateTimeBlocks(timeBlocks);
  if (tbErr) return { error: tbErr };

  if (!deptId || !roomId || !startDate || !purpose) {
    return { error: "필수 입력값이 빠졌습니다." };
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "시간 입력이 잘못되었습니다." };
  }
  if (startDate < todayKey) {
    return {
      error:
        "시작 날짜가 지난 날짜입니다. 오늘 이후 날짜로 다시 입력해 주세요.",
    };
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

  const { data: routes, error: routesErr } = await supabase
    .from("approval_routes")
    .select("*");
  if (routesErr || !routes?.length)
    return { error: routesErr?.message ?? "결재선이 설정되지 않았습니다." };
  const route = pickRoute(routes as ApprovalRoute[], attendeeCount, isExternal);

  // 1) series 본문 갱신
  const { error: upErr } = await supabase
    .from("reservation_series")
    .update({
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
      route_id: route.id,
      current_step: 1,
      status: "pending",
    })
    .eq("id", seriesId);
  if (upErr) return { error: upErr.message };

  // 2) approvals 재생성 (이전 행 모두 삭제 → route 재산출본 insert)
  const { error: dApErr } = await supabase
    .from("approvals")
    .delete()
    .eq("series_id", seriesId);
  if (dApErr) return { error: dApErr.message };
  const apprRows = (route.steps as ApprovalStep[]).map((s) => ({
    series_id: seriesId,
    step_order: s.order,
    role: s.role,
  }));
  const { error: insApErr } = await supabase
    .from("approvals")
    .insert(apprRows);
  if (insApErr) return { error: insApErr.message };

  // 3) 회차 reservations 재생성
  const { error: dRErr } = await supabase
    .from("reservations")
    .delete()
    .eq("series_id", seriesId);
  if (dRErr) return { error: dRErr.message };

  const force = !!options?.forceOverlap;
  const reservationRows = buildOccurrenceWindows(occurrences, timeBlocks).map(
    (w) => ({
      room_id: roomId,
      applicant_id: cur.applicant_id,
      dept_id: deptId,
      start_at: w.startAt,
      end_at: w.endAt,
      purpose,
      attendee_count: attendeeCount,
      is_external: isExternal,
      notes,
      status: "pending" as const,
      route_id: route.id,
      current_step: 1,
      force_overlap: force,
      series_id: seriesId,
    }),
  );
  const { error: insRErr } = await supabase
    .from("reservations")
    .insert(reservationRows);
  if (insRErr) {
    if (insRErr.message?.includes("이미 예약"))
      return { error: insRErr.message };
    return { error: insRErr.message };
  }

  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(`/series/${seriesId}`);
  revalidatePath(`/series/${seriesId}/print`);
  return { id: seriesId };
}

export async function deleteSeries(
  seriesId: string,
  ownerName: string,
  ownerPhone: string,
): Promise<Result> {
  const verify = await verifySeriesOwner(seriesId, ownerName, ownerPhone);
  if (!verify.ok) return { error: verify.error };

  const supabase = createServiceClient();
  // reservations·approvals 는 cascade 로 동시 삭제
  const { error } = await supabase
    .from("reservation_series")
    .delete()
    .eq("id", seriesId);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/reservations");
  return {};
}
