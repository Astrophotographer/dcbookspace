export type UserRole =
  | "applicant"
  | "dept_head"
  | "elder"
  | "manager"
  | "senior_pastor"
  | "admin";

export const ROLE_LABEL: Record<UserRole, string> = {
  applicant: "신청자",
  dept_head: "부서장",
  elder: "관리장로",
  manager: "차장",
  senior_pastor: "당회장",
  admin: "관리자",
};

export type ReservationStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "skipped";

export type Building = {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
};

export type Floor = {
  id: string;
  building_id: string;
  label: string;
  display_order: number;
  created_at: string;
};

export type Room = {
  id: string;
  floor_id: string;
  name: string;
  map_x: number | null;
  map_y: number | null;
  map_w: number | null;
  map_h: number | null;
  display_order: number;
  active: boolean;
  created_at: string;
};

export type Department = {
  id: string;
  name: string;
  display_order: number;
  dept_head_id: string | null;
  elder_id: string | null;
  created_at: string;
};

export type AppUser = {
  id: string;
  auth_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  dept_id: string | null;
  pin_hash: string | null;
  pin_attempts: number;
  pin_locked_until: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApprovalStep = {
  order: number;
  role: UserRole;
  label: string;
};

export type ApprovalRoute = {
  id: string;
  name: string;
  steps: ApprovalStep[];
  conditions: Record<string, unknown> | null;
  is_default: boolean;
  created_at: string;
};

export type Reservation = {
  id: string;
  ref_no: string | null;
  qr_token: string;
  room_id: string;
  applicant_id: string;
  dept_id: string | null;
  start_at: string;
  end_at: string;
  purpose: string;
  attendee_count: number;
  is_external: boolean;
  notes: string | null;
  status: ReservationStatus;
  route_id: string;
  current_step: number;
  created_at: string;
  updated_at: string;
};

export type Approval = {
  id: string;
  reservation_id: string;
  step_order: number;
  role: UserRole;
  approver_id: string | null;
  status: ApprovalStatus;
  signature_token: string;
  signed_at: string | null;
  comment: string | null;
  created_at: string;
};
