// 공통 SELECT 문자열 — Supabase 응답 컬럼 정의를 한 곳에서 관리.
// 스키마 변경 시 이 파일 한 곳만 수정. 호출처는 import 만.
//
// 사용 예:
//   import { RESERVATION_FULL_SELECT } from "@/lib/supabase/selects";
//   .from("reservations").select(RESERVATION_FULL_SELECT)

/** 신청서 + 모든 관계 (room/applicant/dept/approvals/route).
 *  결재 페이지·관리자 상세·시리즈 자식 조회 등에서 공통. */
export const RESERVATION_FULL_SELECT = `*,
  room:rooms (*, floor:floors (*, building:buildings(*))),
  applicant:users!applicant_id (*),
  dept:departments (*),
  approvals (*, approver:users!approver_id (*)),
  route:approval_routes (*)`;

/** 시리즈 + 모든 관계 + 자식 reservations 간략 정보. */
export const SERIES_FULL_SELECT = `*,
  room:rooms (*, floor:floors (*, building:buildings(*))),
  applicant:users!applicant_id (*),
  dept:departments (*),
  approvals (*, approver:users!approver_id (*)),
  route:approval_routes (*),
  reservations (id, start_at, end_at, status, ref_no)`;

/** approvals 행에서 시작해 reservation 까지 join — sign 페이지에서 사용. */
export const APPROVAL_WITH_RESERVATION_SELECT = `*,
  reservation:reservations (
    *,
    room:rooms (*, floor:floors (*, building:buildings(*))),
    applicant:users!applicant_id (*),
    dept:departments (*),
    route:approval_routes (*)
  )`;
