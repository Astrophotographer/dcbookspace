"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ROLE_LABEL, type ApprovalStep } from "@/lib/supabase/types";
import {
  readApproverSession,
  setApproverSessionCookie,
} from "@/lib/approver-session";
import {
  findActiveConflictsFor,
  type ActiveConflictItem,
} from "@/lib/conflicts";
import {
  emitApprovalAfter,
  emitReservationEventAfter,
  emitSeriesEventAfter,
} from "@/lib/webhook";
import { sendPushToUser, getReservationLite } from "@/lib/push";

/**
 * 결재 흐름 종료 시 신청자에게 푸시 알림 (fire-and-forget).
 * 실패는 silently 무시 — 결재 자체 흐름은 알림에 의존하지 않음.
 */
function notifyApplicant(
  ctx: SignContext,
  kind: "approved" | "cancelled",
): void {
  void (async () => {
    try {
      const lite = await getReservationLite(ctx.kind, ctx.id);
      if (!lite) return;
      const detailUrl =
        ctx.kind === "series" ? `/series/${ctx.id}` : `/reservations/${ctx.id}`;
      const refLabel = lite.ref_no ? `#${lite.ref_no}` : "";
      const purposeLabel = lite.purpose ? ` (${lite.purpose})` : "";
      if (kind === "approved") {
        await sendPushToUser(lite.applicant_id, {
          title: "결재 완료",
          body: `신청서 ${refLabel}${purposeLabel} — 모든 결재가 완료됐습니다.`,
          url: detailUrl,
          tag: `approval-${ctx.id}`,
        });
      } else {
        await sendPushToUser(lite.applicant_id, {
          title: "결재 취소",
          body: `신청서 ${refLabel}${purposeLabel} — 당회장이 결재를 취소했습니다.`,
          url: detailUrl,
          tag: `approval-${ctx.id}`,
        });
      }
    } catch {
      /* ignore */
    }
  })();
}

type Result = {
  error?: string;
  ok?: true;
  approverName?: string;
  stepLabel?: string;
  /** 마지막 단계에서 충돌이 있을 때 — 클라이언트가 모달 노출 후 cancelConflicts 와 함께 재호출 */
  needsConfirm?: ActiveConflictItem[];
};

/** "이 신청서들도 같이 취소" 결정 — 비어 있으면 모두 유지 */
export type CancelConflictTarget = {
  kind: "reservation" | "series";
  id: string;
};

const MASTER_PIN = "0000";

// 결재 대상(일회성 신청 / 시리즈 신청)을 통일된 형태로 들고 다니기 위한 컨텍스트.
// 두 테이블이 status·current_step·route·approvals 를 같은 의미로 가지므로
// 호출 측에서는 kind 만 분기하면 된다.
type SignContext = {
  kind: "reservation" | "series";
  id: string;
  status: string;
  current_step: number;
  route: { steps: ApprovalStep[] };
  approvals: { id: string; step_order: number; signature_token: string }[];
};

async function lookupSignTarget(
  supabase: ReturnType<typeof createServiceClient>,
  token: string,
): Promise<SignContext | null> {
  // 시리즈 토큰 먼저 시도
  const { data: s } = await supabase
    .from("reservation_series")
    .select(
      "id, status, current_step, route:approval_routes(*), approvals(*)",
    )
    .eq("qr_token", token)
    .maybeSingle();
  if (s) {
    return {
      kind: "series",
      id: s.id as string,
      status: s.status as string,
      current_step: s.current_step as number,
      route: s.route as unknown as SignContext["route"],
      approvals: s.approvals as unknown as SignContext["approvals"],
    };
  }
  const { data: r } = await supabase
    .from("reservations")
    .select(
      "id, status, current_step, route:approval_routes(*), approvals(*)",
    )
    .eq("qr_token", token)
    .maybeSingle();
  if (r) {
    return {
      kind: "reservation",
      id: r.id as string,
      status: r.status as string,
      current_step: r.current_step as number,
      route: r.route as unknown as SignContext["route"],
      approvals: r.approvals as unknown as SignContext["approvals"],
    };
  }
  return null;
}

function detailPathFor(ctx: SignContext): string {
  return ctx.kind === "series"
    ? `/series/${ctx.id}`
    : `/reservations/${ctx.id}`;
}

/** 마지막 단계 + 충돌이 있으면 conflicts 반환. 그 외는 null. */
async function checkLastStepConflicts(
  supabase: ReturnType<typeof createServiceClient>,
  ctx: SignContext,
): Promise<ActiveConflictItem[] | null> {
  const isLastStep = ctx.current_step === ctx.route.steps.length;
  if (!isLastStep) return null;
  const conflicts = await findActiveConflictsFor(supabase, {
    kind: ctx.kind,
    id: ctx.id,
  });
  return conflicts.length > 0 ? conflicts : null;
}

/** 결재자가 "같이 취소" 선택한 항목들 일괄 cancelled 처리. */
async function cancelConflictTargets(
  supabase: ReturnType<typeof createServiceClient>,
  targets: CancelConflictTarget[],
): Promise<void> {
  for (const t of targets) {
    if (t.kind === "reservation") {
      await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", t.id);
      emitReservationEventAfter("reservation.cancelled", t.id, {
        reason: "conflict_resolution",
      });
    } else {
      // 시리즈 트리거가 children reservations 까지 cascade
      await supabase
        .from("reservation_series")
        .update({ status: "cancelled" })
        .eq("id", t.id);
      emitSeriesEventAfter("reservation.cancelled", t.id, {
        reason: "conflict_resolution",
      });
    }
  }
}

/**
 * 단일 QR 토큰 + PIN으로 본인 단계를 자동 승인.
 * - PIN으로 사용자 식별 → 그 사용자의 role이 현재 단계의 role과 일치하면 결재 진행
 * - PIN이 0000(비상용 마스터 키)이면 어떤 단계든 자동 승인 (approver_id = null, comment에 흔적)
 * - 매칭된 사용자의 role이 'admin'(관리자)이면 어떤 단계든 강제 승인 (approver_id = 본인, comment에 흔적)
 * - 반려는 결재자 폼에서 노출하지 않음. (취소는 cancelByChairman)
 */
export async function signByPin(args: {
  token: string;
  pin: string;
  /**
   * 마지막 단계에서 충돌 검사 후 클라이언트가 모달로 답을 받은 뒤의 재호출.
   * undefined = 아직 검사 안 함. 빈 배열 = "그대로 승인". 비어있지 않은 배열 = "이것들 같이 취소".
   */
  cancelConflicts?: CancelConflictTarget[];
}): Promise<Result> {
  const { token, pin } = args;
  if (!/^\d{4}$/.test(pin)) return { error: "잘못된 번호입니다" };

  const supabase = createServiceClient();

  const ctx = await lookupSignTarget(supabase, token);
  if (!ctx) return { error: "잘못된 결재 링크입니다." };

  if (ctx.status === "rejected") return { error: "이미 반려된 신청입니다." };
  if (ctx.status === "cancelled") return { error: "취소된 신청입니다." };
  if (ctx.status === "approved")
    return { error: "이미 모든 결재가 완료된 신청입니다." };
  if (ctx.status !== "pending") return { error: "진행할 수 없는 상태입니다." };

  const steps = ctx.route.steps;
  const currentStepDef = steps.find((s) => s.order === ctx.current_step);
  if (!currentStepDef) return { error: "결재선 단계 정의가 잘못되었습니다." };

  // 마지막 단계 + 첫 호출(클라가 아직 충돌 결정 안 함)이면 충돌 검사 → 결과 있으면 모달 띄우게 returns
  if (args.cancelConflicts === undefined) {
    const conflicts = await checkLastStepConflicts(supabase, ctx);
    if (conflicts) return { needsConfirm: conflicts };
  }

  const isMaster = pin === MASTER_PIN;
  let matched: { id: string; role: string; name: string; pin_attempts: number } | null = null;
  let isAdminMaster = false;

  if (!isMaster) {
    // PIN으로 사용자 식별
    const { data: candidates, error: e1 } = await supabase
      .from("users")
      .select("*")
      .eq("active", true)
      .not("pin_hash", "is", null);
    if (e1) return { error: e1.message };
    if (!candidates?.length)
      return { error: "결재자가 등록되어 있지 않습니다." };

    for (const u of candidates) {
      if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date())
        continue;
      if (await verifyPin(pin, u.pin_hash!)) {
        matched = u;
        break;
      }
    }
    if (!matched) return { error: "PIN이 일치하지 않습니다." };

    // 관리자(admin) PIN 은 마스터 키처럼 어떤 단계든 강제 승인
    isAdminMaster = matched.role === "admin";

    if (!isAdminMaster && matched.role !== currentStepDef.role) {
      const myStep = steps.find((s) => s.role === matched!.role);
      if (myStep && myStep.order < ctx.current_step) {
        return {
          error: `${ROLE_LABEL[matched.role as keyof typeof ROLE_LABEL]}님은 이미 결재하셨습니다 (현재 ${ROLE_LABEL[currentStepDef.role]} 결재 차례).`,
        };
      }
      return {
        error: `아직 차례가 아닙니다. 현재 ${ROLE_LABEL[currentStepDef.role]} 결재 차례입니다.`,
      };
    }
  }

  // 현재 단계 approval row 조회 → 그 token으로 RPC 호출
  const currentAppr = ctx.approvals.find(
    (a) => a.step_order === ctx.current_step,
  );
  if (!currentAppr) return { error: "결재 행을 찾을 수 없습니다." };

  const { error: e2 } = await supabase.rpc("record_approval", {
    p_token: currentAppr.signature_token,
    p_approver_id: isMaster ? null : matched!.id,
    p_decision: "approve",
    p_comment: isMaster
      ? "마스터 키 결재"
      : isAdminMaster
        ? `관리자 마스터 결재 (${matched!.name})`
        : null,
  });
  if (e2) return { error: e2.message };

  emitApprovalAfter(ctx.kind, ctx.id, {
    step_order: ctx.current_step,
    step_role: currentStepDef.role,
    step_label: currentStepDef.label,
    total_steps: steps.length,
    approver_name: isMaster ? "마스터 키" : matched!.name,
    is_master_pin: isMaster,
    is_admin_master: isAdminMaster,
  });

  // 마지막 단계 통과 = 결재 완료. 신청자에게 푸시 알림.
  if (ctx.current_step >= steps.length) {
    notifyApplicant(ctx, "approved");
  }

  // 결재자가 같이 취소하기로 한 충돌 신청서들 처리
  if (args.cancelConflicts && args.cancelConflicts.length > 0) {
    await cancelConflictTargets(supabase, args.cancelConflicts);
  }

  // 시도 횟수 리셋
  if (!isMaster && matched && matched.pin_attempts > 0) {
    await supabase
      .from("users")
      .update({ pin_attempts: 0, pin_locked_until: null })
      .eq("id", matched.id);
  }

  // 5분 자동 세션 발급 (비상용 마스터 키, 관리자 마스터 결재는 제외 — 한 건만 처리되도록)
  if (!isMaster && !isAdminMaster && matched) {
    await setApproverSessionCookie(matched.id);
  }

  revalidatePath("/");
  revalidatePath(`/sign/${token}`);
  revalidatePath("/reservations");
  revalidatePath(detailPathFor(ctx));
  return {
    ok: true,
    approverName: isMaster
      ? "마스터 키"
      : isAdminMaster
        ? `관리자 ${matched!.name}`
        : matched!.name,
    stepLabel: currentStepDef.label,
  };
}

/**
 * 5분 자동 세션 cookie 로 본인 단계 즉시 자동 승인.
 * - cookie 가 없거나 만료됐으면 { error } 반환 → 클라가 일반 PIN 폼으로 fallback
 * - cookie 의 user 가 이번 단계 담당이 아니면 자동 승인 없이 안내 (silent skip)
 * - 자동 결재 성공 시 cookie 를 다시 5분으로 슬라이딩 갱신
 */
export async function signBySession(args: {
  token: string;
  cancelConflicts?: CancelConflictTarget[];
}): Promise<Result> {
  const { token } = args;

  const session = await readApproverSession();
  if (!session) return { error: "자동 세션이 없습니다." };

  const supabase = createServiceClient();

  const ctx = await lookupSignTarget(supabase, token);
  if (!ctx) return { error: "잘못된 결재 링크입니다." };
  if (ctx.status !== "pending") return { error: "진행할 수 없는 상태입니다." };

  const steps = ctx.route.steps;
  const currentStepDef = steps.find((s) => s.order === ctx.current_step);
  if (!currentStepDef) return { error: "결재선 단계 정의가 잘못되었습니다." };

  const { data: u, error: e1 } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.userId)
    .eq("active", true)
    .maybeSingle();
  if (e1) return { error: e1.message };
  if (!u) return { error: "사용자를 찾을 수 없습니다." };
  if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date())
    return { error: "잠시 후 다시 시도해주세요." };

  // 본인 단계 아니면 자동 승인 거부 → 일반 안내 흐름으로
  if (u.role !== currentStepDef.role) {
    return {
      error: `이번 단계(${ROLE_LABEL[currentStepDef.role]})는 본인이 아닙니다.`,
    };
  }

  const currentAppr = ctx.approvals.find(
    (a) => a.step_order === ctx.current_step,
  );
  if (!currentAppr) return { error: "결재 행을 찾을 수 없습니다." };

  // 마지막 단계 + 첫 호출이면 충돌 검사
  if (args.cancelConflicts === undefined) {
    const conflicts = await checkLastStepConflicts(supabase, ctx);
    if (conflicts) return { needsConfirm: conflicts };
  }

  const { error: e2 } = await supabase.rpc("record_approval", {
    p_token: currentAppr.signature_token,
    p_approver_id: u.id,
    p_decision: "approve",
    p_comment: "5분 자동 세션 결재",
  });
  if (e2) return { error: e2.message };

  emitApprovalAfter(ctx.kind, ctx.id, {
    step_order: ctx.current_step,
    step_role: currentStepDef.role,
    step_label: currentStepDef.label,
    total_steps: steps.length,
    approver_name: u.name,
    is_master_pin: false,
    is_admin_master: false,
    via_auto_session: true,
  });

  // 마지막 단계 통과 → 신청자에게 푸시 알림
  if (ctx.current_step >= steps.length) {
    notifyApplicant(ctx, "approved");
  }

  if (args.cancelConflicts && args.cancelConflicts.length > 0) {
    await cancelConflictTargets(supabase, args.cancelConflicts);
  }

  // 슬라이딩 갱신
  await setApproverSessionCookie(u.id);

  revalidatePath("/");
  revalidatePath(`/sign/${token}`);
  revalidatePath("/reservations");
  revalidatePath(detailPathFor(ctx));
  return {
    ok: true,
    approverName: u.name,
    stepLabel: currentStepDef.label,
  };
}

/**
 * 당회장(senior_pastor)만 가능한 전체 결재 취소.
 * 모든 approval을 pending으로 reset, reservation을 처음부터 다시 진행 상태로.
 */
export async function cancelByChairman(args: {
  token: string;
  pin: string;
}): Promise<Result> {
  const { token, pin } = args;
  if (!/^\d{4}$/.test(pin)) return { error: "잘못된 번호입니다" };

  const supabase = createServiceClient();

  const ctx = await lookupSignTarget(supabase, token);
  if (!ctx) return { error: "잘못된 결재 링크입니다." };

  // PIN으로 사용자 식별
  const { data: candidates, error: e1 } = await supabase
    .from("users")
    .select("*")
    .eq("active", true)
    .not("pin_hash", "is", null);
  if (e1) return { error: e1.message };
  if (!candidates?.length)
    return { error: "결재자가 등록되어 있지 않습니다." };

  let matched: (typeof candidates)[number] | null = null;
  for (const u of candidates) {
    if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date())
      continue;
    if (await verifyPin(pin, u.pin_hash!)) {
      matched = u;
      break;
    }
  }
  if (!matched) return { error: "PIN이 일치하지 않습니다." };

  // 당회장만
  if (matched.role !== "senior_pastor") {
    return { error: "당회장만 취소가 가능합니다." };
  }

  // 모든 approval reset (대상 종류에 따라 필터 분기)
  const approvalsQuery = supabase
    .from("approvals")
    .update({
      status: "pending",
      approver_id: null,
      signed_at: null,
      comment: null,
    });
  const { error: e2 } =
    ctx.kind === "series"
      ? await approvalsQuery.eq("series_id", ctx.id)
      : await approvalsQuery.eq("reservation_id", ctx.id);
  if (e2) return { error: e2.message };

  // 대상 본문도 처음 단계로 리셋 (시리즈는 트리거가 자식 reservations 도 동기화)
  const { error: e3 } =
    ctx.kind === "series"
      ? await supabase
          .from("reservation_series")
          .update({ status: "pending", current_step: 1 })
          .eq("id", ctx.id)
      : await supabase
          .from("reservations")
          .update({ status: "pending", current_step: 1 })
          .eq("id", ctx.id);
  if (e3) return { error: e3.message };

  // 결재 취소(반려) 알림
  notifyApplicant(ctx, "cancelled");

  revalidatePath("/");
  revalidatePath(`/sign/${token}`);
  revalidatePath(detailPathFor(ctx));
  return { ok: true, approverName: matched.name };
}
