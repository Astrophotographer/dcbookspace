import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { emitDiscordTestMessage } from "@/lib/webhook";
import { upsertDiscordSubscriberFromDraft } from "@/app/me/discord/actions";

type DiscordTargetType = "dm" | "channel";

export async function POST(req: NextRequest) {
  const secret = process.env.DISCORD_LINK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured_no_secret" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    token?: unknown;
    recipient_id?: unknown;
    target_type?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const recipientId =
    typeof body.recipient_id === "string"
      ? body.recipient_id.trim()
      : typeof body.recipient_id === "number"
        ? String(body.recipient_id)
        : "";
  const targetType =
    body.target_type === "channel" ? "channel" : "dm";

  if (!token || !recipientId) {
    return NextResponse.json(
      { ok: false, error: "token_and_recipient_id_required" },
      { status: 400 },
    );
  }
  if (!/^\d{15,25}$/.test(recipientId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_recipient_id_format" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("discord_link_tokens")
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

  const draft = row.subscriber_draft as Parameters<
    typeof upsertDiscordSubscriberFromDraft
  >[0];
  const result = await upsertDiscordSubscriberFromDraft(
    draft,
    targetType as DiscordTargetType,
    recipientId,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  await supabase
    .from("discord_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_target_type: targetType,
      used_recipient_id: recipientId,
    })
    .eq("token", token);

  emitDiscordTestMessage(
    {
      recipient_id: recipientId,
      target_type: targetType,
      name: draft.name,
      dept_name: draft.scope_label,
    },
    { reason: "auto_link", scope_label: draft.scope_label },
  );

  return NextResponse.json({
    ok: true,
    name: draft.name,
    scope_label: draft.scope_label,
  });
}
