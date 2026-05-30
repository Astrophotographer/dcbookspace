import {
  isFullAdminSession,
  type AdminSession,
} from "@/lib/admin-session";
import type { ApprovalRoute } from "@/lib/supabase/types";

type GuideElderScopedRow = {
  status: string;
  current_step: number;
  route: Pick<ApprovalRoute, "steps"> | null;
  dept: { elder_id: string | null } | null;
};

function guideElderIdsFor(
  session: AdminSession | null,
  guideElderIds?: readonly string[],
): readonly string[] {
  if (guideElderIds?.length) return guideElderIds;
  return session?.kind === "user" ? [session.userId] : [];
}

export function isAtOrBeforeManagerStep(row: GuideElderScopedRow): boolean {
  const managerStep = row.route?.steps.find((step) => step.role === "manager");
  if (!managerStep) return false;
  return row.current_step <= managerStep.order;
}

export function canGuideElderAccessRow(
  row: GuideElderScopedRow,
  session: AdminSession | null,
): boolean {
  if (isFullAdminSession(session)) return true;
  if (session?.kind !== "user") return false;
  return (
    row.status === "pending" &&
    isAtOrBeforeManagerStep(row)
  );
}

export function canGuideElderApplySignatures(
  row: GuideElderScopedRow,
  session: AdminSession | null,
  guideElderIds?: readonly string[],
): boolean {
  if (isFullAdminSession(session)) return true;
  if (session?.kind !== "user") return false;
  const elderIds = guideElderIdsFor(session, guideElderIds);
  return (
    row.status === "pending" &&
    !!row.dept?.elder_id &&
    elderIds.includes(row.dept.elder_id) &&
    isAtOrBeforeManagerStep(row)
  );
}

export function canGuideElderSeeOwnDeptRow(
  row: GuideElderScopedRow,
  session: AdminSession | null,
  guideElderIds?: readonly string[],
): boolean {
  return canGuideElderApplySignatures(row, session, guideElderIds);
}
