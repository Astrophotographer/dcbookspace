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

/** 사무실 프린터 인쇄 상태. requested → printing → completed. 30초 무응답 시 failed. */
export type PrintStatus =
  | "requested"
  | "printing"
  | "completed"
  | "failed";

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
  /**
   * 2뎁스 트리 구조. NULL 이면 그룹(대분류), 값이 있으면 소분류(leaf).
   * 신청서·결재 라인은 leaf 만 사용.
   */
  parent_id: string | null;
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
  /** 텔레그램 봇 메시지 발송 대상 식별자. nullable. */
  telegram_chat_id: string | null;
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
  /** 시리즈(정기 신청) 회차일 때 채워짐. 일회성은 null. */
  series_id: string | null;
  print_status: PrintStatus;
  /** print_status 가 마지막으로 변경된 시각. 30초 타임아웃 계산 기준. */
  print_status_at: string;
  created_at: string;
  updated_at: string;
};

export type Approval = {
  id: string;
  /** reservation_id 또는 series_id 둘 중 하나만 채워짐 (DB CHECK) */
  reservation_id: string | null;
  series_id: string | null;
  step_order: number;
  role: UserRole;
  approver_id: string | null;
  status: ApprovalStatus;
  signature_token: string;
  signed_at: string | null;
  comment: string | null;
  created_at: string;
};

export type TimeBlock = { start: string; end: string }; // "HH:MM"

/** 정기 신청의 부모 레코드. 결재 흐름은 시리즈 단위로 1회 진행. */
export type ReservationSeries = {
  id: string;
  ref_no: string | null;
  qr_token: string;
  applicant_id: string;
  dept_id: string | null;
  room_id: string;
  weekday: number; // 0=일~6=토
  start_date: string; // YYYY-MM-DD
  end_date: string;
  time_blocks: TimeBlock[];
  purpose: string;
  attendee_count: number;
  is_external: boolean;
  notes: string | null;
  status: ReservationStatus;
  route_id: string;
  current_step: number;
  print_status: PrintStatus;
  print_status_at: string;
  created_at: string;
  updated_at: string;
};

// 고정 행사 (주일 예배 같은 매주 반복 정규 일정).
// 결재 흐름 없음. 관리자만 관리.
export type FixedEvent = {
  id: string;
  name: string;
  room_id: string;
  weekday: number; // 0=일~6=토
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
  effective_from: string; // "YYYY-MM-DD"
  effective_until: string | null;
  display_order: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  active: boolean;
  display_order: number;
  published_at: string;
  created_at: string;
  updated_at: string;
};
