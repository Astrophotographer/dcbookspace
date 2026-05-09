"use server";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * 신청자 본인의 푸시 구독 등록.
 *  - phone 이 입력 시점의 신청서 owner 휴대폰과 일치해야 등록 (약식 본인 확인)
 *  - 같은 endpoint 가 이미 있으면 user_id 와 last_seen_at 만 갱신 (재구독)
 */
export async function registerPushSubscription(args: {
  phone: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok?: true; error?: string }> {
  const phone = args.phone?.trim();
  if (!phone || !args.endpoint || !args.p256dh || !args.auth) {
    return { error: "필수 정보가 누락되었습니다." };
  }

  const supabase = createServiceClient();

  // 휴대폰 번호로 user 찾음 — 동일 번호의 가장 최근 사용자.
  // (이 시스템은 회원가입 없음 — 신청 시 phone 기반으로 user upsert 됨)
  const { data: user, error: e0 } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e0) return { error: e0.message };
  if (!user) {
    return {
      error:
        "사용자를 찾을 수 없습니다. 신청서를 먼저 작성한 뒤 알림을 등록해 주세요.",
    };
  }

  // upsert by endpoint
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        user_agent: args.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * 본인 endpoint 의 구독 해지. 권한 토글 OFF 시 호출.
 */
export async function unregisterPushSubscription(args: {
  endpoint: string;
}): Promise<{ ok?: true; error?: string }> {
  if (!args.endpoint) return { error: "endpoint 가 비어 있습니다." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", args.endpoint);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * 관리자(admin role) 푸시 구독 등록.
 * /admin/* 는 이미 쿠키 세션 인증 통과한 상태에서만 호출됨 → server action 자체가
 * 미들웨어로 보호되므로 추가 인증 가드 불필요.
 *
 * 식별: 관리자가 자기 admin user 를 직접 선택 (admin user_id 직접 전달).
 * 검증: 그 user 가 실제로 role='admin' && active 인지 확인.
 */
export async function registerAdminPushSubscription(args: {
  adminUserId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok?: true; error?: string }> {
  if (
    !args.adminUserId ||
    !args.endpoint ||
    !args.p256dh ||
    !args.auth
  ) {
    return { error: "필수 정보가 누락되었습니다." };
  }
  const supabase = createServiceClient();

  const { data: admin, error: e0 } = await supabase
    .from("users")
    .select("id, role, active")
    .eq("id", args.adminUserId)
    .maybeSingle();
  if (e0) return { error: e0.message };
  if (!admin || admin.role !== "admin" || !admin.active) {
    return { error: "유효한 관리자 계정이 아닙니다." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: admin.id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      user_agent: args.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };
  return { ok: true };
}
