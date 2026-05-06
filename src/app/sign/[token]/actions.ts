"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ROLE_LABEL, type ApprovalStep } from "@/lib/supabase/types";
import {
  readApproverSession,
  setApproverSessionCookie,
} from "@/lib/approver-session";

type Result = {
  error?: string;
  ok?: true;
  approverName?: string;
  stepLabel?: string;
};

const MASTER_PIN = "0000";

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
}): Promise<Result> {
  const { token, pin } = args;
  if (!/^\d{4}$/.test(pin)) return { error: "잘못된 번호입니다" };

  const supabase = createServiceClient();

  // 1) reservation 조회
  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("*, route:approval_routes(*), approvals(*)")
    .eq("qr_token", token)
    .single();
  if (e0 || !r) return { error: "잘못된 결재 링크입니다." };

  if (r.status === "rejected") return { error: "이미 반려된 신청입니다." };
  if (r.status === "cancelled") return { error: "취소된 신청입니다." };
  if (r.status === "approved")
    return { error: "이미 모든 결재가 완료된 신청입니다." };
  if (r.status !== "pending") return { error: "진행할 수 없는 상태입니다." };

  const steps = r.route.steps as ApprovalStep[];
  const currentStepDef = steps.find((s) => s.order === r.current_step);
  if (!currentStepDef) return { error: "결재선 단계 정의가 잘못되었습니다." };

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
      if (myStep && myStep.order < r.current_step) {
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
  const currentAppr = (r.approvals as { id: string; step_order: number; signature_token: string }[]).find(
    (a) => a.step_order === r.current_step,
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
  revalidatePath(`/reservations/${r.id}`);
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
}): Promise<Result> {
  const { token } = args;

  const session = await readApproverSession();
  if (!session) return { error: "자동 세션이 없습니다." };

  const supabase = createServiceClient();

  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("*, route:approval_routes(*), approvals(*)")
    .eq("qr_token", token)
    .single();
  if (e0 || !r) return { error: "잘못된 결재 링크입니다." };
  if (r.status !== "pending") return { error: "진행할 수 없는 상태입니다." };

  const steps = r.route.steps as ApprovalStep[];
  const currentStepDef = steps.find((s) => s.order === r.current_step);
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

  const currentAppr = (
    r.approvals as { id: string; step_order: number; signature_token: string }[]
  ).find((a) => a.step_order === r.current_step);
  if (!currentAppr) return { error: "결재 행을 찾을 수 없습니다." };

  const { error: e2 } = await supabase.rpc("record_approval", {
    p_token: currentAppr.signature_token,
    p_approver_id: u.id,
    p_decision: "approve",
    p_comment: "5분 자동 세션 결재",
  });
  if (e2) return { error: e2.message };

  // 슬라이딩 갱신
  await setApproverSessionCookie(u.id);

  revalidatePath("/");
  revalidatePath(`/sign/${token}`);
  revalidatePath(`/reservations/${r.id}`);
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

  const { data: r, error: e0 } = await supabase
    .from("reservations")
    .select("*")
    .eq("qr_token", token)
    .single();
  if (e0 || !r) return { error: "잘못된 결재 링크입니다." };

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

  // 모든 approval reset
  const { error: e2 } = await supabase
    .from("approvals")
    .update({
      status: "pending",
      approver_id: null,
      signed_at: null,
      comment: null,
    })
    .eq("reservation_id", r.id);
  if (e2) return { error: e2.message };

  const { error: e3 } = await supabase
    .from("reservations")
    .update({ status: "pending", current_step: 1 })
    .eq("id", r.id);
  if (e3) return { error: e3.message };

  revalidatePath("/");
  revalidatePath(`/sign/${token}`);
  revalidatePath(`/reservations/${r.id}`);
  return { ok: true, approverName: matched.name };
}
