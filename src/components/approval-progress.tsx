import { CircleCheckBig, Clock, CircleX, Circle } from "lucide-react";
import type { ApprovalRoute, ApprovalStep } from "@/lib/supabase/types";
import type { ApprovalWithApprover } from "@/lib/repo";
import { cn, formatDateTime } from "@/lib/utils";

type Props = {
  route: ApprovalRoute;
  approvals: ApprovalWithApprover[];
  currentStep: number;
};

export function ApprovalProgress({ route, approvals, currentStep }: Props) {
  const apprByStep = new Map(approvals.map((a) => [a.step_order, a]));

  return (
    <ol className="space-y-2">
      {(route.steps as ApprovalStep[]).map((step) => {
        const a = apprByStep.get(step.order);
        const state =
          a?.status === "approved"
            ? "approved"
            : a?.status === "rejected"
              ? "rejected"
              : step.order === currentStep
                ? "current"
                : "pending";

        const Icon =
          state === "approved"
            ? CircleCheckBig
            : state === "rejected"
              ? CircleX
              : state === "current"
                ? Clock
                : Circle;

        return (
          <li
            key={step.order}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3",
              state === "approved" && "border-emerald-300 bg-emerald-50",
              state === "rejected" && "border-red-300 bg-red-50",
              state === "current" && "border-amber-300 bg-amber-50",
              state === "pending" && "border-stone-200 bg-stone-50",
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6 shrink-0",
                state === "approved" && "text-emerald-600",
                state === "rejected" && "text-red-600",
                state === "current" && "text-amber-600",
                state === "pending" && "text-stone-300",
              )}
            />
            <div className="flex-1">
              <div className="text-base font-semibold text-stone-800">
                {step.label}
              </div>
              {state === "approved" && (
                <div className="text-sm text-stone-600">
                  {a?.approver?.name ?? "(이름 없음)"} ·{" "}
                  {a?.signed_at ? formatDateTime(a.signed_at) : ""}
                </div>
              )}
              {state === "rejected" && (
                <div className="text-sm text-red-700">
                  반려 · {a?.approver?.name ?? ""} ·{" "}
                  {a?.signed_at ? formatDateTime(a.signed_at) : ""}
                  {a?.comment ? ` · "${a.comment}"` : ""}
                </div>
              )}
              {state === "current" && (
                <div className="text-sm text-amber-700">결재 진행중</div>
              )}
              {state === "pending" && (
                <div className="text-sm text-stone-400">대기</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
