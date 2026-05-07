import { CircleCheckBig, Clock, CircleX, Circle } from "lucide-react";
import type {
  ApprovalRoute,
  ApprovalStep,
  Approval,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Props = {
  route: ApprovalRoute;
  approvals: Approval[];
  currentStep: number;
  /** 테이블 컬럼처럼 좁은 곳에선 라벨·화살표 빼고 상태 아이콘만 옆으로 나열. */
  compact?: boolean;
};

type StepState = "approved" | "current" | "rejected" | "pending";

function stepIcon(state: StepState, size: string) {
  if (state === "approved")
    return <CircleCheckBig className={cn(size, "text-emerald-600")} />;
  if (state === "current")
    return <Clock className={cn(size, "text-amber-600")} />;
  if (state === "rejected")
    return <CircleX className={cn(size, "text-red-600")} />;
  return <Circle className={cn(size, "text-stone-300")} />;
}

const STATE_TITLE: Record<StepState, string> = {
  approved: "승인 완료",
  current: "결재 진행중",
  rejected: "반려",
  pending: "대기",
};

export function ApprovalTracker({
  route,
  approvals,
  currentStep,
  compact = false,
}: Props) {
  const apprByStep = new Map(approvals.map((a) => [a.step_order, a]));
  const iconSize = compact ? "h-4 w-4" : "h-5 w-5";

  return (
    <div
      className={cn(
        "flex items-center",
        compact
          ? "flex-nowrap gap-1 whitespace-nowrap"
          : "flex-wrap gap-2 text-sm",
      )}
    >
      {(route.steps as ApprovalStep[]).map((step, idx) => {
        const a = apprByStep.get(step.order);
        const state =
          a?.status === "approved"
            ? "approved"
            : a?.status === "rejected"
              ? "rejected"
              : step.order === currentStep
                ? "current"
                : "pending";
        // compact 모드는 단계별 아이콘만 한 줄로 (라벨/화살표 생략).
        // 호버 시 title 로 단계 이름·상태가 떠서 정보는 유지.
        if (compact) {
          return (
            <span
              key={step.order}
              className="flex flex-none items-center"
              title={`${step.label} — ${STATE_TITLE[state]}`}
              aria-label={`${step.label}: ${STATE_TITLE[state]}`}
            >
              {stepIcon(state, iconSize)}
            </span>
          );
        }
        return (
          <div
            key={step.order}
            className="flex flex-none items-center gap-2"
            title={`${step.label} — ${STATE_TITLE[state]}`}
          >
            <div className="flex items-center gap-1.5">
              {stepIcon(state, iconSize)}
              <span
                className={cn(
                  "whitespace-nowrap font-medium",
                  state === "approved" && "text-emerald-700",
                  state === "current" && "text-amber-700",
                  state === "rejected" && "text-red-700",
                  state === "pending" && "text-stone-500",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < route.steps.length - 1 && (
              <span className="text-stone-300">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
