// repo.ts는 모두 서버 컴포넌트/액션에서만 호출된다 (브라우저로 노출되지 않음).
// 마스터 데이터(부서/건물/호실 등)에 anon SELECT 권한이 없는 환경을 가정해
// service-role 클라이언트를 사용한다. mutation은 별도 server action에서 처리.
//
// React `cache()` 로 래핑된 함수는 같은 요청(Request) 안에서 호출되면 결과를
// 메모화한다. 여러 server component 가 같은 마스터 데이터를 fetch 해도 DB 왕복은 1회.
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import {
  APPROVAL_WITH_RESERVATION_SELECT,
  RESERVATION_FULL_SELECT,
  SERIES_FULL_SELECT,
} from "@/lib/supabase/selects";
import type {
  Building,
  Floor,
  Room,
  Reservation,
  Approval,
  Department,
  AppUser,
  ApprovalRoute,
  FixedEvent,
  ReservationSeries,
} from "@/lib/supabase/types";

export type RoomWithFloor = Room & { floor: Floor & { building: Building } };
export type ApprovalWithApprover = Approval & { approver: AppUser | null };
export type ReservationDetail = Reservation & {
  room: RoomWithFloor;
  applicant: AppUser;
  dept: Department | null;
  approvals: ApprovalWithApprover[];
  route: ApprovalRoute;
};

export type SeriesDetail = ReservationSeries & {
  room: RoomWithFloor;
  applicant: AppUser;
  dept: Department | null;
  approvals: ApprovalWithApprover[];
  route: ApprovalRoute;
  /** 시리즈에 속한 회차 reservations (간략 정보) */
  reservations: Pick<
    Reservation,
    "id" | "start_at" | "end_at" | "status" | "ref_no"
  >[];
};

export const getBuildings = cache(async (): Promise<Building[]> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("buildings")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
});

export const getFloors = cache(async (buildingId?: string): Promise<Floor[]> => {
  const supabase = createServiceClient();
  let q = supabase.from("floors").select("*").order("display_order");
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
});

export const getRooms = cache(async (floorId?: string): Promise<Room[]> => {
  const supabase = createServiceClient();
  let q = supabase
    .from("rooms")
    .select("*")
    .eq("active", true)
    .order("display_order");
  if (floorId) q = q.eq("floor_id", floorId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
});

export const getDepartments = cache(async (): Promise<Department[]> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
});

/** 고정 행사 — 결재 없는 주간 정규 일정. 기본은 active=true 만.
 *  마이그레이션 미적용 환경에서 홈 화면이 깨지지 않게 fixed_events 부재는
 *  빈 배열로 처리하고, 그 외 에러는 상위로 던진다. */
export const getFixedEvents = cache(async (
  options: { includeInactive?: boolean } = {},
): Promise<FixedEvent[]> => {
  const supabase = createServiceClient();
  let q = supabase
    .from("fixed_events")
    .select("*")
    .order("weekday")
    .order("start_time");
  if (!options.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    // PGRST205: PostgREST schema cache에 테이블 없음 (마이그레이션 미적용)
    if ((error as { code?: string }).code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as FixedEvent[];
});

/**
 * 충돌 안내 시 보여줄 1차 연락 관리자.
 * `admin` 우선, 없으면 `manager` 폴백. 모두 없으면 null.
 */
export const getPrimaryAdminContact = cache(async (): Promise<{
  name: string;
  phone: string | null;
  role: "admin" | "manager";
} | null> => {
  const supabase = createServiceClient();
  for (const role of ["admin", "manager"] as const) {
    const { data } = await supabase
      .from("users")
      .select("name, phone")
      .eq("role", role)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (data) return { name: data.name, phone: data.phone, role };
  }
  return null;
});

/** 특정 날짜 범위 안의 모든 예약을 호실/부서/결재자 정보까지 함께 가져옴 */
export const getReservationsBetween = cache(async (
  startISO: string,
  endISO: string,
): Promise<ReservationDetail[]> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_FULL_SELECT)
    .lt("start_at", endISO)
    .gt("end_at", startISO)
    .in("status", ["pending", "approved"])
    .order("start_at");
  if (error) throw error;
  return (data ?? []) as unknown as ReservationDetail[];
});

// QR 토큰 lookup — 같은 토큰을 같은 요청 안에서 여러 컴포넌트가 호출할 때 dedupe.
export const getReservationByQrToken = cache(async (qrToken: string) => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_FULL_SELECT)
    .eq("qr_token", qrToken)
    .single();
  if (error || !data) return null;
  return data as unknown as ReservationDetail;
});

export const getSeries = cache(async (
  id: string,
): Promise<SeriesDetail | null> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservation_series")
    .select(SERIES_FULL_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as unknown as SeriesDetail;
});

/**
 * QR 토큰으로 결재 대상 조회. 시리즈 토큰을 먼저 시도하고 없으면 일회성 reservation.
 */
export type SignTarget =
  | { kind: "series"; series: SeriesDetail }
  | { kind: "reservation"; reservation: ReservationDetail }
  | null;

export const getSignTargetByQrToken = cache(async (
  token: string,
): Promise<SignTarget> => {
  const supabase = createServiceClient();
  const { data: series } = await supabase
    .from("reservation_series")
    .select(SERIES_FULL_SELECT)
    .eq("qr_token", token)
    .maybeSingle();
  if (series) {
    return { kind: "series", series: series as unknown as SeriesDetail };
  }
  const r = await getReservationByQrToken(token);
  if (r) return { kind: "reservation", reservation: r };
  return null;
});

export async function getReservationByToken(token: string) {
  const supabase = createServiceClient();
  const { data: appr, error } = await supabase
    .from("approvals")
    .select(APPROVAL_WITH_RESERVATION_SELECT)
    .eq("signature_token", token)
    .single();
  if (error || !appr) return null;
  return appr as unknown as Approval & {
    reservation: ReservationDetail;
  };
}
