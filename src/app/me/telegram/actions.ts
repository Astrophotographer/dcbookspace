"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import { isAdmin } from "@/lib/admin-server";
import { emitTestMessage } from "@/lib/webhook";
import { getTelegramBotUsername } from "@/lib/telegram";
import type { WebhookEvent } from "@/lib/webhook";

const ALLOWED_EVENT_TYPES: WebhookEvent[] = [
  "reservation.created",
  "series.created",
  "reservation.step_approved",
  "reservation.approved",
  "reservation.rejected",
  "reservation.cancelled",
  "reservation.print_failed",
];

// 일반 사용자가 선택할 수 없는 (관리자 전용) 이벤트.
const ADMIN_ONLY_EVENTS = new Set<WebhookEvent>(["reservation.print_failed"]);

const DEFAULT_EVENTS: WebhookEvent[] = [
  "reservation.created",
  "series.created",
  "reservation.approved",
  "reservation.rejected",
];

const EVENT_TYPES_BY_FORM_ID: Record<string, WebhookEvent[]> = {
  created: ["reservation.created", "series.created"],
  step_approved: ["reservation.step_approved"],
  approved: ["reservation.approved"],
  rejected: ["reservation.rejected"],
  cancelled: ["reservation.cancelled"],
};

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10분
const TOKEN_BYTES = 12; // base64url 16자 ≈ 96bit

type Draft = {
  name: string;
  phone: string;
  bot_username: string;
  scope_label: string;
  home_dept_id: string | null;
  watch_dept_ids: string[];
  watch_all: boolean;
  event_types: WebhookEvent[];
  registered_by_admin: boolean;
};

type ValidateOk = { ok: true; draft: Draft };
type ValidateErr = { ok: false; error: string };

/**
 * 폼 데이터 → 정규화된 draft. 관리자 검증·권한 제한 모두 여기서.
 * - 일반 사용자도 본인 부서/모든 부서 범위를 선택할 수 있다.
 * - 이벤트 종류는 사용자가 체크한 값만 허용 목록으로 정규화한다.
 */
async function validateAndNormalize(fd: FormData): Promise<ValidateOk | ValidateErr> {
  const name = String(fd.get("name") ?? "").trim();
  const phoneRaw = String(fd.get("phone") ?? "").replace(/\D/g, "");
  const botUsername = await getTelegramBotUsername();

  if (!name) return { ok: false, error: "이름을 입력해 주세요." };
  if (!isValidPhone(phoneRaw)) return { ok: false, error: PHONE_INVALID_MESSAGE };

  if (!botUsername) {
    return {
      ok: false,
      error:
        "교회 알림봇 연결 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.",
    };
  }

  const supabase = createServiceClient();

  const admin = await isAdmin();
  const scope = String(fd.get("dept_scope") ?? "home").trim();
  const watchAll = scope === "all";
  const watchDeptIds: string[] = [];
  const deptId = String(fd.get("dept_id") ?? "").trim();
  if (!deptId) return { ok: false, error: "본인 소속 부서를 선택해 주세요." };

  const { data: dept } = await supabase
    .from("departments")
    .select("id, name, parent_id")
    .eq("id", deptId)
    .maybeSingle();
  if (!dept) return { ok: false, error: "선택한 부서를 찾을 수 없습니다." };
  if (!dept.parent_id) {
    return { ok: false, error: "대분류가 아닌 실제 부서를 선택해 주세요." };
  }

  const homeDeptId = dept.id as string;
  const scopeLabel = watchAll ? "모든 부서" : (dept.name as string);
  if (!watchAll) {
    watchDeptIds.push(homeDeptId);
  }

  // ── 이벤트 종류
  const rawEventIds = fd
    .getAll("event_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const selectedEventIds =
    rawEventIds.length > 0 ? rawEventIds : ["created", "approved", "rejected"];

  let eventTypes = selectedEventIds.flatMap(
    (eventId) => EVENT_TYPES_BY_FORM_ID[eventId] ?? [],
  );
  eventTypes = [...new Set(eventTypes)].filter((v) =>
    (ALLOWED_EVENT_TYPES as string[]).includes(v),
  );
  if (!admin) {
    eventTypes = eventTypes.filter((e) => !ADMIN_ONLY_EVENTS.has(e));
  }
  if (eventTypes.length === 0 && rawEventIds.length === 0) {
    eventTypes = DEFAULT_EVENTS;
  }
  if (eventTypes.length === 0) {
    return { ok: false, error: "최소 한 가지 알림 종류는 선택해 주세요." };
  }

  return {
    ok: true,
    draft: {
      name,
      phone: phoneRaw,
      bot_username: botUsername,
      scope_label: scopeLabel,
      home_dept_id: homeDeptId,
      watch_dept_ids: watchDeptIds,
      watch_all: watchAll,
      event_types: eventTypes,
      registered_by_admin: admin,
    },
  };
}

/**
 * Deep-link 자동 등록용 토큰 발급.
 * draft 를 telegram_link_tokens 에 저장 → 텔레그램 봇 웹훅이 /start TOKEN 을 받으면
 * /api/telegram/link 로 token+chat_id 를 보내고, 그쪽에서 draft 를 꺼내 인서트.
 */
export async function requestAutoLink(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
  deepLinkUrl?: string;
  token?: string;
  expiresAt?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const botUsername = v.draft.bot_username;

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const supabase = createServiceClient();
  const { error } = await supabase.from("telegram_link_tokens").insert({
    token,
    subscriber_draft: v.draft,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    deepLinkUrl: `https://t.me/${botUsername}?start=${token}`,
    token,
    expiresAt,
  };
}

/**
 * 수동 입력 흐름. 텔레그램 숫자 ID를 직접 받아서 곧장 등록 + 테스트 메시지.
 */
export async function submitManual(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const chatId = String(fd.get("chat_id") ?? "").trim();
  if (!/^-?\d+$/.test(chatId)) {
    return {
      ok: false,
      error: "텔레그램 숫자 ID는 숫자만 입력해 주세요. (그룹은 -100… 형식)",
    };
  }

  const result = await upsertSubscriberFromDraft(v.draft, chatId);
  if (!result.ok) return result;

  emitTestMessage(
    { chat_id: chatId, name: v.draft.name, dept_name: v.draft.scope_label },
    { reason: "manual_register", scope_label: v.draft.scope_label },
  );

  revalidatePath("/me/telegram");
  return { ok: true };
}

/**
 * 이미 등록된 구독자에게 테스트 메시지를 다시 보낸다.
 * 자동 연결 완료 후 사용자가 화면에서 직접 눌러 확인하는 용도.
 */
export async function sendRegisteredTestMessage(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const supabase = createServiceClient();
  let query = supabase
    .from("telegram_subscribers")
    .select("chat_id, name, scope_label")
    .eq("phone", v.draft.phone)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (v.draft.home_dept_id) {
    query = query.eq("home_dept_id", v.draft.home_dept_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.chat_id) {
    return {
      ok: false,
      error: "텔레그램 연결 완료 후 테스트 메시지를 보낼 수 있습니다.",
    };
  }

  emitTestMessage(
    {
      chat_id: data.chat_id as string,
      name: (data.name as string | null) ?? v.draft.name,
      dept_name: (data.scope_label as string | null) ?? v.draft.scope_label,
    },
    { reason: "test_button", scope_label: v.draft.scope_label },
  );

  return { ok: true };
}

/**
 * draft + chat_id → telegram_subscribers + 자식 테이블 upsert.
 * - chat_id unique 충돌 시 active=true 로 되살리고 메타데이터 갱신.
 * - 자식 테이블(*_depts, *_events) 은 delete-then-insert 로 단순화.
 *
 * /api/telegram/link 라우트와 공유 — export.
 */
export async function upsertSubscriberFromDraft(
  draft: Draft,
  chatId: string,
): Promise<{ ok: true; subscriberId: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();

  // 1) 부모 row upsert
  const { data: existing } = await supabase
    .from("telegram_subscribers")
    .select("id")
    .eq("phone", draft.phone)
    .eq("chat_id", chatId)
    .maybeSingle();

  let subscriberId: string;
  if (existing) {
    const { error } = await supabase
      .from("telegram_subscribers")
      .update({
        name: draft.name,
        phone: draft.phone,
        bot_username: draft.bot_username,
        scope_label: draft.scope_label,
        home_dept_id: draft.home_dept_id,
        registered_by_admin: draft.registered_by_admin,
        watch_all: draft.watch_all,
        active: true,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    subscriberId = existing.id as string;
  } else {
    const { data, error } = await supabase
      .from("telegram_subscribers")
      .insert({
        name: draft.name,
        phone: draft.phone,
        bot_username: draft.bot_username,
        scope_label: draft.scope_label,
        home_dept_id: draft.home_dept_id,
        chat_id: chatId,
        registered_by_admin: draft.registered_by_admin,
        watch_all: draft.watch_all,
        active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "구독자 등록에 실패했습니다." };
    }
    subscriberId = data.id as string;
  }

  // 2) 자식: depts — clear & insert
  await supabase
    .from("telegram_subscriber_depts")
    .delete()
    .eq("subscriber_id", subscriberId);
  if (!draft.watch_all && draft.watch_dept_ids.length > 0) {
    const rows = draft.watch_dept_ids.map((dept_id) => ({
      subscriber_id: subscriberId,
      dept_id,
    }));
    const { error: e2 } = await supabase
      .from("telegram_subscriber_depts")
      .insert(rows);
    if (e2) return { ok: false, error: e2.message };
  }

  // 3) 자식: events — clear & insert
  await supabase
    .from("telegram_subscriber_events")
    .delete()
    .eq("subscriber_id", subscriberId);
  const eventRows = draft.event_types.map((event_type) => ({
    subscriber_id: subscriberId,
    event_type,
  }));
  const { error: e3 } = await supabase
    .from("telegram_subscriber_events")
    .insert(eventRows);
  if (e3) return { ok: false, error: e3.message };

  return { ok: true, subscriberId };
}
