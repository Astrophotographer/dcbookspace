import "server-only";

import type { TelegramRecipient, WebhookEvent } from "@/lib/webhook";

type Payload = Record<string, unknown>;

const TELEGRAM_TIMEOUT_MS = 3_000;
const TELEGRAM_MAX_TEXT_LENGTH = 3900;
const BOT_PROFILE_CACHE_MS = 10 * 60 * 1000;

type TelegramSendOptions = {
  parseMode?: "HTML" | "Markdown";
};

type BotProfileCache = {
  username: string | null;
  checkedAt: number;
};

let botProfileCache: BotProfileCache | null = null;

function getBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function isTelegramDirectEnabled(): boolean {
  return getBotToken() !== null;
}

export async function getTelegramBotUsername(): Promise<string | null> {
  const envUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  if (envUsername) return envUsername.replace(/^@/, "");

  const token = getBotToken();
  if (!token) return null;

  const now = Date.now();
  if (
    botProfileCache &&
    now - botProfileCache.checkedAt < BOT_PROFILE_CACHE_MS
  ) {
    return botProfileCache.username;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[telegram] getMe returned ${res.status}`);
      botProfileCache = { username: null, checkedAt: now };
      return null;
    }

    const json = (await res.json()) as {
      ok?: boolean;
      result?: { username?: unknown };
    };
    const username =
      json.ok && typeof json.result?.username === "string"
        ? json.result.username.replace(/^@/, "")
        : null;
    botProfileCache = { username, checkedAt: now };
    return username;
  } catch (e) {
    console.warn(`[telegram] getMe failed: ${(e as Error).message}`);
    botProfileCache = { username: null, checkedAt: now };
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "****";
  return `${chatId.slice(0, 2)}***${chatId.slice(-4)}`;
}

function truncateTelegramText(text: string): string {
  if (text.length <= TELEGRAM_MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, TELEGRAM_MAX_TEXT_LENGTH - 3)}...`;
}

async function postTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  options?: TelegramSendOptions,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncateTelegramText(text),
        parse_mode: options?.parseMode ?? "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[telegram] sendMessage ${maskChatId(chatId)} returned ${res.status}: ${body.slice(0, 200)}`,
      );
      return false;
    }

    return true;
  } catch (e) {
    console.warn(
      `[telegram] sendMessage ${maskChatId(chatId)} failed: ${(e as Error).message}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramText(
  chatId: string,
  text: string,
  options?: TelegramSendOptions,
): Promise<boolean> {
  const token = getBotToken();
  if (!token) return false;
  return postTelegramMessage(token, chatId, text, options);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : null;
}

function stringValue(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function extractRecipients(data: Payload): TelegramRecipient[] {
  const raw = Array.isArray(data.recipients) ? data.recipients : [];
  const seen = new Set<string>();
  const recipients: TelegramRecipient[] = [];

  for (const item of raw) {
    const r = asRecord(item);
    const chatId = stringValue(r?.chat_id);
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    recipients.push({
      chat_id: chatId,
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
  const startAt = stringValue(data.start_at);
  const endAt = stringValue(data.end_at);
  if (startAt && endAt) {
    return `${formatKstDate(startAt)} ${formatKstTime(startAt)}-${formatKstTime(endAt)}`;
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
      return "예약이 취소되었습니다";
    case "reservation.print_failed":
      return "프린트 출력에 실패했습니다";
    case "test.message":
      return "장소사용신청서 알림 연결 확인";
  }
}

function buildTelegramText(event: WebhookEvent, data: Payload): string {
  if (event === "test.message") {
    const scope = stringValue(data.scope_label) ?? stringValue(data.dept_name);
    return [
      "<b>장소사용신청서 알림 연결 확인</b>",
      "",
      `${escapeHtml(scope ?? "선택한 범위")} 알림이 연결되었습니다.`,
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
    `<b>${escapeHtml(title)}</b> #${escapeHtml(refNo)}`,
    "",
    `부서/신청자: ${escapeHtml(deptName)} / ${escapeHtml(applicantName)}`,
  ];

  if (roomLabel) lines.push(`장소: ${escapeHtml(roomLabel)}`);
  if (whenLabel) lines.push(`일시: ${escapeHtml(whenLabel)}`);
  if (purpose) lines.push(`목적: ${escapeHtml(purpose)}`);

  if (event === "reservation.step_approved") {
    const stepText = [stepLabel, approverName].filter(Boolean).join(" ");
    if (stepText) lines.push("", `결재 단계: ${escapeHtml(stepText)}`);
  }

  if (data.admin_forced) {
    lines.push("", "관리자 강제 처리");
  }

  return lines.join("\n");
}

export async function sendTelegramNotification(
  event: WebhookEvent,
  data: Payload,
): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  const recipients = extractRecipients(data);
  if (recipients.length === 0) return;

  const text = buildTelegramText(event, data);
  await Promise.allSettled(
    recipients.map((recipient) =>
      postTelegramMessage(token, recipient.chat_id, text),
    ),
  );
}
