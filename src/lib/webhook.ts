import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ApprovalStep, UserRole } from "@/lib/supabase/types";

/**
 * 외부로 이벤트를 푸시하는 fire-and-forget 웹훅.
 *
 * 환경변수
 *   - WEBHOOK_TARGETS: 콤마 구분 URL 목록 (예: "https://n8n.example/hook,https://other/hook")
 *   - WEBHOOK_SECRET:  HMAC-SHA256 서명에 쓰는 비밀 (16자 이상). 비어 있으면 서명 없이 발사.
 *
 * 받는 쪽이 검증할 헤더
 *   - X-DCB-Event:    이벤트 타입
 *   - X-DCB-Delivery: UUID — 같은 시도/재시도 식별 (멱등키)
 *   - X-DCB-Signature: sha256=<base64url HMAC of body>
 *
 * 정책: 결과 await 안 함(서버 액션 응답을 막지 않게). after() 를 통해 응답
 *       전송 후 백그라운드로 발사. 실패는 console.error 로 Vercel 로그에 남김.
 *       n8n 등 fan-out 측이 자체 재시도 책임.
 */

export type WebhookEvent =
  | "reservation.created"
  | "series.created"
  | "reservation.step_approved"
  | "reservation.approved"
  | "reservation.rejected"
  | "reservation.cancelled"
  | "reservation.print_failed";

type Payload = Record<string, unknown>;

function getTargets(): string[] {
  const raw = process.env.WEBHOOK_TARGETS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}

function getSecret(): string | null {
  const s = process.env.WEBHOOK_SECRET;
  return s && s.length >= 16 ? s : null;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * 이벤트 디스패치. 등록된 모든 URL 로 동시에 POST 한다.
 * 호출자: `void dispatchWebhook(...)` 처럼 await 안 하는 패턴 권장.
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  data: Payload,
): Promise<void> {
  const targets = getTargets();
  if (targets.length === 0) return; // 미설정 — graceful no-op

  const delivery = randomUUID();
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({
    event,
    delivery,
    occurred_at: occurredAt,
    data,
  });

  const secret = getSecret();
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-dcb-event": event,
    "x-dcb-delivery": delivery,
  };
  if (secret) headers["x-dcb-signature"] = `sha256=${sign(body, secret)}`;

  // 8초 timeout — 받는 측이 멈춰도 우리 백그라운드 작업이 같이 멈추지 않게.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8_000);

  await Promise.allSettled(
    targets.map(async (url) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          console.error(
            `[webhook] ${event} → ${url} returned ${res.status} ${res.statusText}`,
          );
        }
      } catch (e) {
        console.error(
          `[webhook] ${event} → ${url} failed: ${(e as Error).message}`,
        );
      }
    }),
  );
  clearTimeout(t);
}

// ---- 페이로드 빌더 -----------------------------------------------------------

type ReservationSummaryRow = {
  id: string;
  ref_no: string | null;
  status: string;
  start_at: string;
  end_at: string;
  purpose: string;
  series_id: string | null;
  applicant: { name: string; phone: string | null };
  dept: { name: string } | null;
  room: {
    name: string;
    floor: { label: string; building: { name: string } };
  };
};

type SeriesSummaryRow = {
  id: string;
  ref_no: string | null;
  status: string;
  start_date: string;
  end_date: string;
  weekday: number;
  purpose: string;
  applicant: { name: string; phone: string | null };
  dept: { name: string } | null;
  room: {
    name: string;
    floor: { label: string; building: { name: string } };
  };
};

/**
 * 현재 진행 중인 단계의 결재자 후보들 (이름·전화·텔레그램 chat_id).
 * - dept_head/elder: 신청서가 속한 부서의 dept_head_id / elder_id 1명
 * - manager/senior_pastor: 해당 role 의 모든 활성 사용자
 * 받는 쪽(n8n) 이 이 배열을 보고 chat_id 가 있는 사용자에게만 메시지 발송하면 됨.
 */
type ApproverCandidate = {
  name: string;
  phone: string | null;
  telegram_chat_id: string | null;
  role: UserRole;
};

async function findApproversByRole(
  supabase: ReturnType<typeof createServiceClient>,
  role: UserRole,
  deptId: string | null,
): Promise<ApproverCandidate[]> {
  if (role === "dept_head" || role === "elder") {
    if (!deptId) return [];
    const { data: dept } = await supabase
      .from("departments")
      .select("dept_head_id, elder_id")
      .eq("id", deptId)
      .single();
    if (!dept) return [];
    const userId =
      role === "dept_head" ? dept.dept_head_id : dept.elder_id;
    if (!userId) return [];
    const { data: u } = await supabase
      .from("users")
      .select("name, phone, telegram_chat_id")
      .eq("id", userId)
      .eq("active", true)
      .maybeSingle();
    return u
      ? [
          {
            name: u.name as string,
            phone: (u.phone as string | null) ?? null,
            telegram_chat_id:
              (u.telegram_chat_id as string | null) ?? null,
            role,
          },
        ]
      : [];
  }
  // manager / senior_pastor / admin / applicant — 같은 role 활성 사용자 모두
  const { data } = await supabase
    .from("users")
    .select("name, phone, telegram_chat_id")
    .eq("role", role)
    .eq("active", true);
  return ((data ?? []) as Array<{
    name: string;
    phone: string | null;
    telegram_chat_id: string | null;
  }>).map((u) => ({ ...u, role }));
}

type RouteSnapshot = {
  current_step: number;
  status: string;
  dept_id: string | null;
  route: { steps: ApprovalStep[] };
};

async function findCurrentApprovers(
  supabase: ReturnType<typeof createServiceClient>,
  table: "reservations" | "reservation_series",
  id: string,
): Promise<ApproverCandidate[]> {
  const { data } = await supabase
    .from(table)
    .select(
      "current_step, status, dept_id, route:approval_routes (steps)",
    )
    .eq("id", id)
    .single();
  if (!data) return [];
  const snap = data as unknown as RouteSnapshot;
  if (snap.status !== "pending") return [];
  const stepDef = snap.route.steps.find(
    (s) => s.order === snap.current_step,
  );
  if (!stepDef) return [];
  return findApproversByRole(supabase, stepDef.role, snap.dept_id);
}

async function buildReservationPayload(id: string): Promise<Payload | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reservations")
    .select(
      `id, ref_no, status, start_at, end_at, purpose, series_id,
       applicant:users!applicant_id (name, phone),
       dept:departments (name),
       room:rooms (name, floor:floors (label, building:buildings (name)))`,
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  const r = data as unknown as ReservationSummaryRow;
  return {
    kind: "reservation",
    id: r.id,
    ref_no: r.ref_no,
    status: r.status,
    start_at: r.start_at,
    end_at: r.end_at,
    purpose: r.purpose,
    is_recurring_child: r.series_id != null,
    applicant: { name: r.applicant.name, phone: r.applicant.phone },
    dept_name: r.dept?.name ?? null,
    room: {
      name: r.room.name,
      floor_label: r.room.floor.label,
      building_name: r.room.floor.building.name,
    },
  };
}

async function buildSeriesPayload(id: string): Promise<Payload | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reservation_series")
    .select(
      `id, ref_no, status, start_date, end_date, weekday, purpose,
       applicant:users!applicant_id (name, phone),
       dept:departments (name),
       room:rooms (name, floor:floors (label, building:buildings (name)))`,
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  const s = data as unknown as SeriesSummaryRow;
  return {
    kind: "series",
    id: s.id,
    ref_no: s.ref_no,
    status: s.status,
    start_date: s.start_date,
    end_date: s.end_date,
    weekday: s.weekday,
    purpose: s.purpose,
    applicant: { name: s.applicant.name, phone: s.applicant.phone },
    dept_name: s.dept?.name ?? null,
    room: {
      name: s.room.name,
      floor_label: s.room.floor.label,
      building_name: s.room.floor.building.name,
    },
  };
}

// ---- 호출자 편의 래퍼 ---------------------------------------------------------

/**
 * 페이로드에 next_approvers 를 추가한다.
 * status='pending' 상태면 현재 진행 중인 단계의 결재자 후보 목록,
 * 아니면 빈 배열. 받는 쪽(n8n) 이 chat_id 있는 사람에게만 텔레그램 발송하도록.
 */
async function withNextApprovers(
  table: "reservations" | "reservation_series",
  id: string,
  payload: Payload,
): Promise<Payload> {
  const supabase = createServiceClient();
  const next = await findCurrentApprovers(supabase, table, id);
  return { ...payload, next_approvers: next };
}

/**
 * 응답 전송 후 백그라운드로 reservation 이벤트 발사. 호출 사이트에서 await 불필요.
 * `extras` 로 step 정보·관리자 강제 표식 등 추가 필드 합칠 수 있음.
 */
export function emitReservationEventAfter(
  event: WebhookEvent,
  id: string,
  extras?: Payload,
): void {
  // env 미설정이면 빌더·dispatch 둘 다 no-op 되도록 짧게 끊는다 — 무의미한 DB 조회 회피.
  if (getTargets().length === 0) return;
  after(async () => {
    const base = await buildReservationPayload(id);
    if (!base) return;
    const payload = await withNextApprovers("reservations", id, base);
    await dispatchWebhook(event, { ...payload, ...(extras ?? {}) });
  });
}

export function emitSeriesEventAfter(
  event: WebhookEvent,
  id: string,
  extras?: Payload,
): void {
  if (getTargets().length === 0) return;
  after(async () => {
    const base = await buildSeriesPayload(id);
    if (!base) return;
    const payload = await withNextApprovers("reservation_series", id, base);
    await dispatchWebhook(event, { ...payload, ...(extras ?? {}) });
  });
}

/**
 * 결재 한 단계 통과 직후 호출. 항상 `step_approved` 발사 + 그 결재로 마지막
 * 단계까지 통과했다면 추가로 `approved` 발사. payload 한 번만 빌드해서 두 이벤트
 * 모두 같은 데이터 사용. step_approved 페이로드에는 next_approvers (다음 단계
 * 결재자 후보) 가 포함됨 → n8n 이 그 사람들에게 텔레그램 알림 발송.
 */
export function emitApprovalAfter(
  kind: "reservation" | "series",
  id: string,
  stepInfo: Payload,
): void {
  if (getTargets().length === 0) return;
  after(async () => {
    const base =
      kind === "reservation"
        ? await buildReservationPayload(id)
        : await buildSeriesPayload(id);
    if (!base) return;
    const table = kind === "reservation" ? "reservations" : "reservation_series";
    const payload = await withNextApprovers(table, id, base);
    await dispatchWebhook("reservation.step_approved", {
      ...payload,
      ...stepInfo,
    });
    // record_approval RPC 가 마지막 단계 통과 시 status 를 'approved' 로 올림.
    // approved 상태에선 next_approvers 가 빈 배열이라 안전.
    if (payload.status === "approved") {
      await dispatchWebhook("reservation.approved", payload);
    }
  });
}
