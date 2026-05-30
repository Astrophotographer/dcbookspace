"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import { isAdmin } from "@/lib/admin-server";
import { emitDiscordTestMessage } from "@/lib/webhook";
import { getDiscordBotUsername, getDiscordInviteUrl } from "@/lib/discord";
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

const ADMIN_ONLY_EVENTS = new Set<WebhookEvent>(["reservation.print_failed"]);

const DEFAULT_EVENTS: WebhookEvent[] = [
  "reservation.created",
  "series.created",
  "reservation.approved",
  "reservation.rejected",
  "reservation.cancelled",
];

const EVENT_TYPES_BY_FORM_ID: Record<string, WebhookEvent[]> = {
  created: ["reservation.created", "series.created"],
  step_approved: ["reservation.step_approved"],
  approved: ["reservation.approved"],
  rejected: ["reservation.rejected", "reservation.cancelled"],
};

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_BYTES = 12;

type DiscordTargetType = "dm" | "channel";

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

async function validateAndNormalize(fd: FormData): Promise<ValidateOk | ValidateErr> {
  const name = String(fd.get("name") ?? "").trim();
  const phoneRaw = String(fd.get("phone") ?? "").replace(/\D/g, "");
  const botUsername = await getDiscordBotUsername();

  if (!name) return { ok: false, error: "이름을 입력해 주세요." };
  if (!isValidPhone(phoneRaw)) return { ok: false, error: PHONE_INVALID_MESSAGE };

  if (!botUsername) {
    return {
      ok: false,
      error:
        "교회 디스코드 알림봇 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.",
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

export async function requestAutoLink(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
  inviteUrl?: string;
  command?: string;
  token?: string;
  expiresAt?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const supabase = createServiceClient();
  const { error } = await supabase.from("discord_link_tokens").insert({
    token,
    subscriber_draft: v.draft,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    inviteUrl: getDiscordInviteUrl() ?? undefined,
    command: `/알림등록 ${token}`,
    token,
    expiresAt,
  };
}

export async function submitManual(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const recipientId = String(fd.get("recipient_id") ?? "").trim();
  const targetType = String(fd.get("target_type") ?? "dm").trim();
  if (targetType !== "dm" && targetType !== "channel") {
    return { ok: false, error: "디스코드 알림 대상 종류를 확인해 주세요." };
  }
  if (!/^\d{15,25}$/.test(recipientId)) {
    return {
      ok: false,
      error: "디스코드 ID는 15~25자리 숫자로 입력해 주세요.",
    };
  }

  const result = await upsertDiscordSubscriberFromDraft(
    v.draft,
    targetType,
    recipientId,
  );
  if (!result.ok) return result;

  emitDiscordTestMessage(
    {
      recipient_id: recipientId,
      target_type: targetType,
      name: v.draft.name,
      dept_name: v.draft.scope_label,
    },
    { reason: "manual_register", scope_label: v.draft.scope_label },
  );

  revalidatePath("/me/discord");
  return { ok: true };
}

export async function sendRegisteredTestMessage(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const v = await validateAndNormalize(fd);
  if (!v.ok) return { ok: false, error: v.error };

  const supabase = createServiceClient();
  let query = supabase
    .from("discord_subscribers")
    .select("recipient_id, target_type, name, scope_label")
    .eq("phone", v.draft.phone)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (v.draft.home_dept_id) {
    query = query.eq("home_dept_id", v.draft.home_dept_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.recipient_id) {
    return {
      ok: false,
      error: "디스코드 연결 완료 후 테스트 메시지를 보낼 수 있습니다.",
    };
  }

  const targetType = data.target_type === "channel" ? "channel" : "dm";
  emitDiscordTestMessage(
    {
      recipient_id: data.recipient_id as string,
      target_type: targetType,
      name: (data.name as string | null) ?? v.draft.name,
      dept_name: (data.scope_label as string | null) ?? v.draft.scope_label,
    },
    { reason: "test_button", scope_label: v.draft.scope_label },
  );

  return { ok: true };
}

export async function upsertDiscordSubscriberFromDraft(
  draft: Draft,
  targetType: DiscordTargetType,
  recipientId: string,
): Promise<{ ok: true; subscriberId: string } | { ok: false; error: string }> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("discord_subscribers")
    .select("id")
    .eq("phone", draft.phone)
    .eq("target_type", targetType)
    .eq("recipient_id", recipientId)
    .maybeSingle();

  let subscriberId: string;
  if (existing) {
    const { error } = await supabase
      .from("discord_subscribers")
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
      .from("discord_subscribers")
      .insert({
        name: draft.name,
        phone: draft.phone,
        bot_username: draft.bot_username,
        scope_label: draft.scope_label,
        home_dept_id: draft.home_dept_id,
        target_type: targetType,
        recipient_id: recipientId,
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

  await supabase
    .from("discord_subscriber_depts")
    .delete()
    .eq("subscriber_id", subscriberId);
  if (!draft.watch_all && draft.watch_dept_ids.length > 0) {
    const rows = draft.watch_dept_ids.map((dept_id) => ({
      subscriber_id: subscriberId,
      dept_id,
    }));
    const { error: e2 } = await supabase
      .from("discord_subscriber_depts")
      .insert(rows);
    if (e2) return { ok: false, error: e2.message };
  }

  await supabase
    .from("discord_subscriber_events")
    .delete()
    .eq("subscriber_id", subscriberId);
  const eventRows = draft.event_types.map((event_type) => ({
    subscriber_id: subscriberId,
    event_type,
  }));
  const { error: e3 } = await supabase
    .from("discord_subscriber_events")
    .insert(eventRows);
  if (e3) return { ok: false, error: e3.message };

  return { ok: true, subscriberId };
}
