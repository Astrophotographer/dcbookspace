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
  compact?: boolean;
};

function stepIcon(state: "approved" | "current" | "rejected" | "pending") {
  if (state === "approved")
    return <CircleCheckBig className="h-5 w-5 text-emerald-600" />;
  if (state === "current") return <Clock className="h-5 w-5 text-amber-600" />;
  if (state === "rejected")
    return <CircleX className="h-5 w-5 text-red-600" />;
  return <Circle className="h-5 w-5 text-stone-300" />;
}

export function ApprovalTracker({
  route,
  approvals,
  currentStep,
  compact = false,
}: Props) {
  const apprByStep = new Map(approvals.map((a) => [a.step_order, a]));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "text-sm")}>
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
        return (
          <div key={step.order} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {stepIcon(state)}
              <span
                className={cn(
                  "font-medium",
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
