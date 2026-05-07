import type { ComponentType, SVGProps } from "react";
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";
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
  confirmed: "bg-emerald-100 text-emerald-800",
  rejected:  "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-800",
};

// 호실/캘린더 칩에 쓰는 좀 더 옅은 색
export const STATUS_CHIP_CLASS: Record<DisplayStatus, string> = {
  draft:     "bg-stone-50 text-stone-700",
  submitted: "bg-sky-50 text-sky-800",
  in_review: "bg-amber-50 text-amber-800",
  confirmed: "bg-emerald-50 text-emerald-800",
  rejected:  "bg-stone-100 text-stone-600",
  cancelled: "bg-red-50 text-red-800",
};

// 색만으로 상태 구분 못하는 어르신·색약 사용자를 위한 아이콘 신호
type IconType = ComponentType<SVGProps<SVGSVGElement>>;
export const STATUS_ICON: Record<DisplayStatus, IconType> = {
  draft:     FileText,
  submitted: Clock,
  in_review: Loader2,
  confirmed: CircleCheck,
  rejected:  CircleX,
  cancelled: Ban,
};
