import { cn } from "@/lib/utils";
import type { ApprovalStatus, Approval, Reservation } from "@/lib/supabase/types";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/reservation-status";

type BadgeInput = {
  status: Reservation["status"];
  approvals?: Approval[];
};

export function ReservationBadge({ reservation }: { reservation: BadgeInput }) {
  const s = displayStatus(reservation);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium",
        STATUS_BADGE_CLASS[s],
      )}
    >
      {STATUS_LABEL[s]}
    </span>
  );
}

const APPROVAL: Record<ApprovalStatus, { label: string; cls: string }> = {
  pending:   { label: "대기",   cls: "bg-amber-100 text-amber-800" },
  approved:  { label: "승인",   cls: "bg-emerald-100 text-emerald-800" },
  rejected:  { label: "반려",   cls: "bg-red-100 text-red-800" },
  skipped:   { label: "건너뜀", cls: "bg-stone-100 text-stone-600" },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const v = APPROVAL[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", v.cls)}>
      {v.label}
    </span>
  );
}
