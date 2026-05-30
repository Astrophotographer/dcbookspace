import "server-only";

import type { DiscordRecipient, WebhookEvent } from "@/lib/webhook";

type Payload = Record<string, unknown>;

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_TIMEOUT_MS = 4_000;
const DISCORD_MAX_TEXT_LENGTH = 1900;
const BOT_PROFILE_CACHE_MS = 10 * 60 * 1000;

type DiscordTargetType = "dm" | "channel";
type BotProfileCache = {
  username: string | null;
  checkedAt: number;
};

let botProfileCache: BotProfileCache | null = null;

function getBotToken(): string | null {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  return token || null;
}

export function isDiscordDirectEnabled(): boolean {
  return getBotToken() !== null;
}

export async function getDiscordBotUsername(): Promise<string | null> {
  const username = process.env.NEXT_PUBLIC_DISCORD_BOT_USERNAME?.trim();
  if (username) return username;

  const now = Date.now();
  if (
    botProfileCache &&
    now - botProfileCache.checkedAt < BOT_PROFILE_CACHE_MS
  ) {
    return botProfileCache.username;
  }

  const json = await discordFetch<{
    username?: unknown;
    discriminator?: unknown;
    global_name?: unknown;
  }>("/users/@me", { method: "GET" });
  if (!json || typeof json.username !== "string") {
    botProfileCache = { username: null, checkedAt: now };
    return null;
  }

  const label =
    typeof json.discriminator === "string" && json.discriminator !== "0"
      ? `${json.username}#${json.discriminator}`
      : json.username;
  botProfileCache = { username: label, checkedAt: now };
  return label;
}

export function getDiscordInviteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  return url && /^https?:\/\//.test(url) ? url : null;
}

function truncateDiscordText(text: string): string {
  if (text.length <= DISCORD_MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, DISCORD_MAX_TEXT_LENGTH - 3)}...`;
}

function maskId(id: string): string {
  if (id.length <= 6) return "******";
  return `${id.slice(0, 3)}***${id.slice(-4)}`;
}

async function discordFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T | null> {
  const token = getBotToken();
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);

  try {
    const res = await fetch(`${DISCORD_API_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json; charset=utf-8",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[discord] ${path} returned ${res.status}: ${body.slice(0, 200)}`,
      );
      return null;
    }

    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[discord] ${path} failed: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function createDmChannel(userId: string): Promise<string | null> {
  const json = await discordFetch<{ id?: unknown }>("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  });
  return typeof json?.id === "string" ? json.id : null;
}

async function postDiscordMessage(
  channelId: string,
  text: string,
): Promise<boolean> {
  const json = await discordFetch<{ id?: unknown }>(
    `/channels/${channelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content: truncateDiscordText(text) }),
    },
  );
  return !!json?.id;
}

export async function sendDiscordText(
  recipientId: string,
  targetType: DiscordTargetType,
  text: string,
): Promise<boolean> {
  const channelId =
    targetType === "dm" ? await createDmChannel(recipientId) : recipientId;
  if (!channelId) {
    console.warn(`[discord] cannot resolve target ${targetType}:${maskId(recipientId)}`);
    return false;
  }
  return postDiscordMessage(channelId, text);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : null;
}

function stringValue(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractRecipients(data: Payload): DiscordRecipient[] {
  const raw = Array.isArray(data.discord_recipients)
    ? data.discord_recipients
    : [];
  const seen = new Set<string>();
  const recipients: DiscordRecipient[] = [];

  for (const item of raw) {
    const r = asRecord(item);
    const recipientId = stringValue(r?.recipient_id);
    const targetType = stringValue(r?.target_type);
    if (
      !recipientId ||
      (targetType !== "dm" && targetType !== "channel") ||
      seen.has(`${targetType}:${recipientId}`)
    ) {
      continue;
    }
    seen.add(`${targetType}:${recipientId}`);
    recipients.push({
      recipient_id: recipientId,
      target_type: targetType,
      name: stringValue(r?.name) ?? "",
      dept_name: stringValue(r?.dept_name),
    });
  }

  return recipients;
}

function getRefNo(data: Payload): string {
  return (
    stringValue(data.ref_no) ??
    stringValue(data.id)?.slice(0, 8) ??
    "unknown"
  );
}

function getApplicantName(data: Payload): string {
  return stringValue(asRecord(data.applicant)?.name) ?? "-";
}

function getRoomLabel(data: Payload): string | null {
  const room = asRecord(data.room);
  if (!room) return null;
  return [
    stringValue(room.building_name),
    stringValue(room.floor_label),
    stringValue(room.name),
  ]
    .filter(Boolean)
    .join(" ");
}

function formatKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatKstTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function getWhenLabel(data: Payload): string | null {
  const displayLabel = stringValue(data.when_label);
  if (displayLabel) return displayLabel;

  const startAt = stringValue(data.start_at);
  const endAt = stringValue(data.end_at);
  if (startAt && endAt) {
    const startDate = formatKstDate(startAt);
    const endDate = formatKstDate(endAt);
    const startTime = formatKstTime(startAt);
    const endTime = formatKstTime(endAt);
    return startDate === endDate
      ? `${startDate} ${startTime}-${endTime}`
      : `${startDate} ${startTime} ~ ${endDate} ${endTime}`;
  }

  const startDate = stringValue(data.start_date);
  const endDate = stringValue(data.end_date);
  if (startDate && endDate) {
    return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
  }

  return startDate ?? null;
}

function getEventTitle(event: WebhookEvent): string {
  switch (event) {
    case "reservation.created":
      return "신청서가 접수되었습니다";
    case "series.created":
      return "정기 신청서가 접수되었습니다";
    case "reservation.step_approved":
      return "결재가 진행되었습니다";
    case "reservation.approved":
      return "예약이 확정되었습니다";
    case "reservation.rejected":
      return "신청이 반려되었습니다";
    case "reservation.cancelled":
      return "신청이 반려되었습니다";
    case "reservation.print_failed":
      return "프린트 출력에 실패했습니다";
    case "test.message":
      return "장소사용신청서 알림 연결 확인";
  }
}

function buildDiscordText(event: WebhookEvent, data: Payload): string {
  if (event === "test.message") {
    const scope = stringValue(data.scope_label) ?? stringValue(data.dept_name);
    return [
      "**장소사용신청서 알림 연결 확인**",
      "",
      `${scope ?? "선택한 범위"} 알림이 연결되었습니다.`,
    ].join("\n");
  }

  const title = getEventTitle(event);
  const refNo = getRefNo(data);
  const deptName = stringValue(data.dept_name) ?? "-";
  const applicantName = getApplicantName(data);
  const roomLabel = getRoomLabel(data);
  const whenLabel = getWhenLabel(data);
  const purpose = stringValue(data.purpose);
  const stepLabel = stringValue(data.step_label) ?? stringValue(data.step_role);
  const approverName = stringValue(data.approver_name);

  const lines = [
    `**${title}** #${refNo}`,
    "",
    `부서/신청자: ${deptName} / ${applicantName}`,
  ];

  if (roomLabel) lines.push(`장소: ${roomLabel}`);
  if (whenLabel) lines.push(`일시: ${whenLabel}`);
  if (purpose) lines.push(`목적: ${purpose}`);

  if (event === "reservation.step_approved") {
    const stepText = [stepLabel, approverName].filter(Boolean).join(" ");
    if (stepText) lines.push("", `결재 단계: ${stepText}`);
  }

  if (data.admin_forced) {
    lines.push("", "관리자 강제 처리");
  }

  return lines.join("\n");
}

export async function sendDiscordNotification(
  event: WebhookEvent,
  data: Payload,
): Promise<void> {
  if (!isDiscordDirectEnabled()) return;

  const recipients = extractRecipients(data);
  if (recipients.length === 0) return;

  const text = buildDiscordText(event, data);
  await Promise.allSettled(
    recipients.map((recipient) =>
      sendDiscordText(recipient.recipient_id, recipient.target_type, text),
    ),
  );
}
