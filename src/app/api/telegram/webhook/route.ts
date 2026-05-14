import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTelegramText } from "@/lib/telegram";
import { upsertSubscriberFromDraft } from "@/app/me/telegram/actions";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
  };
};

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseStartToken(text: string): string | null {
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  return raw.split(/\s+/)[0] ?? null;
}

async function reply(chatId: string, text: string) {
  await sendTelegramText(chatId, text).catch(() => {
    /* Telegram retry를 막기 위해 응답은 계속 200으로 보낸다. */
  });
}

/**
 * Telegram Bot API webhook endpoint.
 *
 * BotFather token 으로 setWebhook 을 한 번 등록하면, 사용자가
 * `/start TOKEN` 을 누를 때 n8n 없이 이 route 가 chat_id 를 받아 등록한다.
 */
export async function POST(req: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured_no_bot_token" },
      { status: 503 },
    );
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim();
  if (
    expectedSecret &&
    req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }

  const chatId =
    update.message?.chat?.id === undefined
      ? ""
      : String(update.message.chat.id);
  const text = update.message?.text?.trim() ?? "";
  if (!chatId || !text.startsWith("/start")) {
    return NextResponse.json({ ok: true, ignored: "not_start_message" });
  }

  const token = parseStartToken(text);
  if (!token) {
    await reply(
      chatId,
      "장소사용신청서 알림 연결 링크에서 다시 시작해 주세요.",
    );
    return NextResponse.json({ ok: true, ignored: "missing_token" });
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("telegram_link_tokens")
    .select("token, subscriber_draft, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    await reply(chatId, "알림 연결 토큰을 찾을 수 없습니다.");
    return NextResponse.json({ ok: true, linked: false });
  }
  if (row.used_at) {
    await reply(chatId, "이미 사용된 알림 연결 링크입니다.");
    return NextResponse.json({ ok: true, linked: false });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await reply(chatId, "알림 연결 시간이 지났습니다. 다시 신청해 주세요.");
    return NextResponse.json({ ok: true, linked: false });
  }

  const draft = row.subscriber_draft as Parameters<
    typeof upsertSubscriberFromDraft
  >[0];
  const result = await upsertSubscriberFromDraft(draft, chatId);
  if (!result.ok) {
    await reply(
      chatId,
      `알림 연결에 실패했습니다.\n${escapeHtml(result.error)}`,
    );
    return NextResponse.json({ ok: true, linked: false });
  }

  await supabase
    .from("telegram_link_tokens")
    .update({ used_at: new Date().toISOString(), used_chat_id: chatId })
    .eq("token", token);

  const scopeLabel = draft.scope_label || "선택한 범위";
  await reply(
    chatId,
    [
      "<b>장소사용신청서 알림 연결 완료</b>",
      "",
      `${escapeHtml(scopeLabel)} 알림을 텔레그램으로 보내드릴게요.`,
    ].join("\n"),
  );

  return NextResponse.json({
    ok: true,
    linked: true,
    name: draft.name,
    scope_label: scopeLabel,
  });
}
