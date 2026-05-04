// repo.ts는 모두 서버 컴포넌트/액션에서만 호출된다 (브라우저로 노출되지 않음).
// 마스터 데이터(부서/건물/호실 등)에 anon SELECT 권한이 없는 환경을 가정해
// service-role 클라이언트를 사용한다. mutation은 별도 server action에서 처리.
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Building,
  Floor,
  Room,
  Reservation,
  Approval,
  Department,
  AppUser,
  ApprovalRoute,
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

export async function getBuildings(): Promise<Building[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("buildings")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function getFloors(buildingId?: string): Promise<Floor[]> {
  const supabase = createServiceClient();
  let q = supabase.from("floors").select("*").order("display_order");
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getRooms(floorId?: string): Promise<Room[]> {
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
}

export async function getDepartments(): Promise<Department[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

/** 특정 날짜 범위 안의 모든 예약을 호실/부서/결재자 정보까지 함께 가져옴 */
export async function getReservationsBetween(
  startISO: string,
  endISO: string,
): Promise<ReservationDetail[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .lt("start_at", endISO)
    .gt("end_at", startISO)
    .in("status", ["pending", "approved"])
    .order("start_at");
  if (error) throw error;
  return (data ?? []) as unknown as ReservationDetail[];
}

export async function getReservationByQrToken(qrToken: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .eq("qr_token", qrToken)
    .single();
  if (error || !data) return null;
  return data as unknown as ReservationDetail;
}

export async function getReservationByToken(token: string) {
  const supabase = createServiceClient();
  const { data: appr, error } = await supabase
    .from("approvals")
    .select(
      `*,
       reservation:reservations (
         *,
         room:rooms (*, floor:floors (*, building:buildings(*))),
         applicant:users!applicant_id (*),
         dept:departments (*),
         route:approval_routes (*)
       )`,
    )
    .eq("signature_token", token)
    .single();
  if (error || !appr) return null;
  return appr as unknown as Approval & {
    reservation: ReservationDetail;
  };
}
