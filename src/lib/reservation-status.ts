import type { ComponentType, SVGProps } from "react";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
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
  confirmed: "장소사용확정",
  rejected: "반려",
  cancelled: "취소",
};

// 모달·테이블 행처럼 시간·장소 등 다른 정보가 옆에 있어 글자 공간이 좁은 곳에서.
// 풀 라벨은 STATUS_LABEL, 헤더·범례 등 단독으로 노출되는 곳은 풀 라벨 유지.
export const STATUS_LABEL_SHORT: Record<DisplayStatus, string> = {
  draft: "임시",
  submitted: "대기중",
  in_review: "진행중",
  confirmed: "사용확정",
  rejected: "반려",
  cancelled: "취소",
};

// 뱃지(pill 모양) — chip 보다 살짝 옅은 톤 + 가벼운 보더로 부드러운 룩
export const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  draft:     "bg-stone-100 border border-stone-300 text-stone-700",
  submitted: "bg-yellow-50 border border-yellow-400 text-yellow-800",
  in_review: "bg-emerald-50 border border-emerald-400 text-emerald-800",
  confirmed: "bg-sky-50 border border-sky-400 text-sky-800",
  rejected:  "bg-stone-200 border border-stone-400 text-stone-700",
  cancelled: "bg-pink-50 border border-pink-300 text-pink-800",
};

// 호실/캘린더 칩에 쓰는 색 — 자연 + 파스텔 톤 + 보더 (저채도).
// 대기=마른 풀(yellow), 진행=잎사귀(emerald), 확정=파스텔 하늘(sky), 취소=파스텔 핑크.
// 100 단계 bg + 400-500 단계 border 로 부드러운 룩.
export const STATUS_CHIP_CLASS: Record<DisplayStatus, string> = {
  draft:     "bg-stone-50 border border-stone-300 text-stone-700",
  submitted: "bg-yellow-100 border border-yellow-500 text-yellow-900",
  in_review: "bg-emerald-100 border border-emerald-500 text-emerald-900",
  confirmed: "bg-sky-100 border border-sky-500 text-sky-900 font-semibold",
  rejected:  "bg-stone-100 border border-stone-400 text-stone-600",
  cancelled: "bg-pink-100 border border-pink-400 text-pink-900",
};

// 색만으로 상태 구분 못하는 어르신·색약 사용자를 위한 아이콘 신호
type IconType = ComponentType<SVGProps<SVGSVGElement>>;
export const STATUS_ICON: Record<DisplayStatus, IconType> = {
  draft:     FileText,
  submitted: Clock,
  in_review: ArrowRight,
  confirmed: CircleCheck,
  rejected:  CircleX,
  cancelled: Ban,
};
