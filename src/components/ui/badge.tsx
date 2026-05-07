import { Check, Clock, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalStatus, Approval, Reservation } from "@/lib/supabase/types";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_ICON,
  STATUS_LABEL,
} from "@/lib/reservation-status";

type BadgeInput = {
  status: Reservation["status"];
  approvals?: Approval[];
};

export function ReservationBadge({ reservation }: { reservation: BadgeInput }) {
  const s = displayStatus(reservation);
  const Icon = STATUS_ICON[s];
  return (
    <span
      className={cn(
        // whitespace-nowrap + min-w 로 좁은 컬럼에서도 텍스트가 줄바꿈·잘림 없이 표시 (한글 7자까지 여유)
        "inline-flex min-w-[5.5rem] items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium",
        STATUS_BADGE_CLASS[s],
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 flex-none" />
      {STATUS_LABEL[s]}
    </span>
  );
}

const APPROVAL: Record<
  ApprovalStatus,
  {
    label: string;
    cls: string;
    Icon: typeof Check;
  }
> = {
  pending:   { label: "대기",   cls: "bg-amber-100 text-amber-800",     Icon: Clock },
  approved:  { label: "승인",   cls: "bg-emerald-100 text-emerald-800", Icon: Check },
  rejected:  { label: "반려",   cls: "bg-red-100 text-red-800",         Icon: X },
  skipped:   { label: "건너뜀", cls: "bg-stone-100 text-stone-600",     Icon: Minus },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const v = APPROVAL[status];
  const Icon = v.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        v.cls,
      )}
    >
      <Icon aria-hidden className="h-3 w-3 flex-none" />
      {v.label}
    </span>
  );
}
