import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Web Push 발송 헬퍼.
 *
 * VAPID 환경변수가 없으면 silently skip — 로컬/CI 에서 키 없이 빌드 가능.
 *   VAPID_PUBLIC_KEY      서버·클라이언트 공통 (NEXT_PUBLIC_VAPID_PUBLIC_KEY 도 동일 값)
 *   VAPID_PRIVATE_KEY     서버 전용
 *   VAPID_SUBJECT         mailto:admin@church.example 또는 https://... (RFC 8292)
 *
 * 에러 처리:
 *   - 410 Gone / 404 Not Found → 구독 해지된 것. push_subscriptions 행 삭제
 *   - 그 외 일시 오류는 로그만 남기고 다음 발송에 영향 안 줌
 */

export type PushPayload = {
  title: string;
  body: string;
  /** 클릭 시 이동할 URL (도메인 생략 = 같은 origin) */
  url?: string;
  /** 같은 tag 의 알림은 묶임 — 같은 신청서 알림 누적 방지에 사용 */
  tag?: string;
};

let vapidConfigured = false;
function normalizeVapidSubject(value: string | undefined): string {
  const subject = value?.trim();
  if (!subject) return "mailto:admin@example.com";
  if (/^(mailto:|https?:\/\/)/i.test(subject)) return subject;
  return `mailto:${subject}`;
}

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = normalizeVapidSubject(process.env.VAPID_SUBJECT);
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(subj, pub, priv);
  } catch (e) {
    console.warn("[push] invalid VAPID config", e);
    return false;
  }
  vapidConfigured = true;
  return true;
}

/**
 * 한 사용자의 모든 구독 endpoint 로 동일 페이로드 발송.
 * 결과는 Promise 로 반환하지 않고 silently 처리 — 호출 측은 await 없이 fire-and-forget 가능.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) {
    return { sent: 0, failed: 0 };
  }
  const supabase = createServiceClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !subs?.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }, // 24h. 그 안에 못 받으면 그냥 폐기
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // 구독이 만료/해지됨 → 정리
          stale.push(s.id);
        } else {
          console.warn("[push] send failed", { endpoint: s.endpoint, status, err: e });
        }
        failed++;
      }
    }),
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }
  return { sent, failed };
}

/**
 * 신청서 ref_no / 목적 / 신청자 id 를 한 번에 조회.
 * sign action 들에서 알림 보낼 때 반복적으로 필요.
 */
export async function getReservationLite(
  kind: "reservation" | "series",
  id: string,
): Promise<{ ref_no: string | null; purpose: string; applicant_id: string } | null> {
  const supabase = createServiceClient();
  const table = kind === "series" ? "reservation_series" : "reservations";
  const { data } = await supabase
    .from(table)
    .select("ref_no, purpose, applicant_id")
    .eq("id", id)
    .maybeSingle();
  if (!data?.applicant_id) return null;
  return {
    ref_no: data.ref_no ?? null,
    purpose: data.purpose ?? "",
    applicant_id: data.applicant_id as string,
  };
}

/**
 * 강제 중복(force_overlap) 신청 발생 시:
 *  - 같은 호실·시간대를 가리키는 기존 다른 신청자들 (자기 자신 제외)
 *  - admin role 전체 사용자
 * 두 그룹에 푸시 알림. 시리즈/일회성 모두 reservations 테이블 기준으로 조회.
 */
export async function notifyForcedOverlap(args: {
  newReservationId: string;
  roomId: string;
  startAt: string;
  endAt: string;
  newApplicantName: string;
  newApplicantId: string;
}): Promise<void> {
  if (!configureVapid()) return;
  const supabase = createServiceClient();

  // 시간 겹침 (start_at < endAt && end_at > startAt) + 자기 자신 제외
  const { data: conflicts } = await supabase
    .from("reservations")
    .select("applicant_id")
    .eq("room_id", args.roomId)
    .neq("id", args.newReservationId)
    .in("status", ["pending", "approved"])
    .lt("start_at", args.endAt)
    .gt("end_at", args.startAt);

  // 신청자별 dedupe
  const victimIds = Array.from(
    new Set(
      (conflicts ?? [])
        .map((c) => c.applicant_id as string)
        .filter((id) => id && id !== args.newApplicantId),
    ),
  );

  // 기존 신청자들에게
  await Promise.all(
    victimIds.map((uid) =>
      sendPushToUser(uid, {
        title: "겹치는 신청이 들어왔어요",
        body: `${args.newApplicantName}님이 같은 시간·호실로 신청서를 강제 등록했습니다. 관리자 검토 예정.`,
        url: "/reservations",
        tag: `overlap-${args.newReservationId}`,
      }),
    ),
  );

  // 관리자 전체에게도 한 번
  await sendPushToRole("admin", {
    title: "강제 중복 신청 발생",
    body: `${args.newApplicantName}님이 force_overlap 으로 신청서를 등록했습니다. 검토가 필요해요.`,
    url: "/admin/reservations",
    tag: `overlap-${args.newReservationId}`,
  });
}

/**
 * 특정 role 의 모든 활성 사용자에게 발송. 관리자(admin) 전체 알림에 사용.
 *
 * 최적화: user 별로 별도 쿼리 돌리지 않고 user_id IN (...) 단일 조회로 endpoint 일괄 fetch.
 *   admin N 명 → DB 쿼리 1+1 = 2번 (이전엔 1+N).
 */
export async function sendPushToRole(
  role: "admin" | "manager",
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) return { sent: 0, failed: 0 };
  const supabase = createServiceClient();

  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("role", role)
    .eq("active", true);
  if (!users?.length) return { sent: 0, failed: 0 };
  const userIds = users.map((u) => u.id as string);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error || !subs?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          stale.push(s.id);
        } else {
          console.warn("[push] role-send failed", { endpoint: s.endpoint, status, err: e });
        }
        failed++;
      }
    }),
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }
  return { sent, failed };
}
