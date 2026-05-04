import type { Approval, Reservation } from "@/lib/supabase/types";

// 화면 표시용 상태. DB enum과 별도로 approvals 진행 정도까지 반영한다.
export type DisplayStatus =
  | "draft"
  | "submitted"   // 신청서완료 (결재 0건 진행)
  | "in_review"   // 결재중 (1단계 이상 진행, 미완)
  | "confirmed"   // 확정 (모든 단계 통과)
  | "rejected"
  | "cancelled";

type Input = {
  status: Reservation["status"];
  approvals?: Approval[];
};

export function displayStatus(r: Input): DisplayStatus {
  if (r.status === "draft") return "draft";
  if (r.status === "rejected") return "rejected";
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "approved") return "confirmed";

  // status === 'pending'
  const approvedCount = (r.approvals ?? []).filter(
    (a) => a.status === "approved",
  ).length;
  return approvedCount === 0 ? "submitted" : "in_review";
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "임시저장",
  submitted: "결재대기중",
  in_review: "결재진행중",
  confirmed: "예약완료",
  rejected: "반려",
  cancelled: "취소",
};

export const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  draft:     "bg-stone-100 text-stone-700",
  submitted: "bg-sky-100 text-sky-800",
  in_review: "bg-amber-100 text-amber-800",
  confirmed: "bg-red-100 text-red-800",
  rejected:  "bg-stone-200 text-stone-700",
  cancelled: "bg-stone-200 text-stone-500",
};

// 호실/캘린더 칩에 쓰는 좀 더 옅은 색
export const STATUS_CHIP_CLASS: Record<DisplayStatus, string> = {
  draft:     "bg-stone-50 text-stone-700",
  submitted: "bg-sky-50 text-sky-800",
  in_review: "bg-amber-50 text-amber-800",
  confirmed: "bg-red-50 text-red-800",
  rejected:  "bg-stone-100 text-stone-600",
  cancelled: "bg-stone-100 text-stone-500",
};
