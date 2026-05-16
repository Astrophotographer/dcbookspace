import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { emitTestMessage } from "@/lib/webhook";
import { upsertSubscriberFromDraft } from "@/app/me/telegram/actions";

/**
 * POST /api/telegram/link
 *
 * n8n 자동 등록 워크플로우가 호출. 봇이 `/start TOKEN` 메시지를 받으면
 * 이 endpoint 로 `{ token, chat_id }` POST.
 *
 * 인증: Authorization: Bearer ${TELEGRAM_LINK_SECRET}
 *
 * 성공 시 telegram_subscribers 등록 + 토큰 used 처리 + 첫 인사 테스트 메시지.
 * 답장 본문에 `name`, `scope_label` 포함 → 봇이 등록자와 범위를 안내 가능.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_LINK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured_no_secret" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // 단순 비교로 충분 — secret 길이 일정해서 timing attack 위험 낮음.
  if (auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { token?: unknown; chat_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const chatId =
    typeof body.chat_id === "string"
      ? body.chat_id.trim()
      : typeof body.chat_id === "number"
        ? String(body.chat_id)
        : "";

  if (!token || !chatId) {
    return NextResponse.json(
      { ok: false, error: "token_and_chat_id_required" },
      { status: 400 },
    );
  }
  if (!/^-?\d+$/.test(chatId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_chat_id_format" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // 토큰 조회 + 검증
  const { data: row } = await supabase
    .from("telegram_link_tokens")
    .select("token, subscriber_draft, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "token_not_found" },
      { status: 404 },
    );
  }
  if (row.used_at) {
    return NextResponse.json(
      { ok: false, error: "token_already_used" },
      { status: 409 },
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "token_expired" },
      { status: 410 },
    );
  }

  // draft 꺼내서 등록
  const draft = row.subscriber_draft as Parameters<typeof upsertSubscriberFromDraft>[0];
  const result = await upsertSubscriberFromDraft(draft, chatId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  // 토큰 used 마킹
  await supabase
    .from("telegram_link_tokens")
    .update({ used_at: new Date().toISOString(), used_chat_id: chatId })
    .eq("token", token);

  // 첫 인사 메시지 — n8n 이 이 webhook 을 받으면 같은 chat_id 로 인사
  emitTestMessage(
    { chat_id: chatId, name: draft.name, dept_name: draft.scope_label },
    { reason: "auto_link", scope_label: draft.scope_label },
  );

  return NextResponse.json({
    ok: true,
    name: draft.name,
    scope_label: draft.scope_label,
  });
}
