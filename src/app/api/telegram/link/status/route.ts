import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/telegram/link/status?token=XXX
 *
 * 자가 등록 페이지가 2초 간격으로 polling. 봇이 처리 끝났는지 확인용.
 * - linked=true : 등록 완료 (used_at 세팅됨). name, scope_label 도 함께 반환해 화면 갱신.
 * - linked=false + expired=true : 토큰 만료
 * - linked=false + expiresIn=N : 아직 대기 중. N=남은 초.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { linked: false, error: "token_required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("telegram_link_tokens")
    .select("subscriber_draft, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      { linked: false, error: "token_not_found" },
      { status: 404 },
    );
  }

  if (data.used_at) {
    const draft = data.subscriber_draft as {
      name?: string;
      scope_label?: string;
    } | null;
    return NextResponse.json({
      linked: true,
      name: draft?.name ?? "",
      scope_label: draft?.scope_label ?? "",
    });
  }

  const expiresAtMs = new Date(data.expires_at).getTime();
  const expired = expiresAtMs < Date.now();
  if (expired) {
    return NextResponse.json({ linked: false, expired: true });
  }

  return NextResponse.json({
    linked: false,
    expiresIn: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
  });
}
