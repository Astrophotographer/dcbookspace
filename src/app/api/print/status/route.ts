// NAS 인쇄 에이전트 → Vercel: 인쇄 결과 보고 endpoint.
//
// Authorization 헤더:  Bearer <PRINT_AGENT_TOKEN>
// Body (JSON):
//   {
//     "kind": "reservation" | "series",
//     "id": "<uuid>",
//     "status": "printing" | "completed" | "failed",
//     "note": "에이전트 로그 메모 (선택)"
//   }
//
// 응답: 200 { ok: true } / 401 / 400 / 500

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { PrintStatus } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const ALLOWED: PrintStatus[] = ["printing", "completed", "failed"];

function isValidKind(v: unknown): v is "reservation" | "series" {
  return v === "reservation" || v === "series";
}
function isValidStatus(v: unknown): v is PrintStatus {
  return typeof v === "string" && (ALLOWED as string[]).includes(v);
}

export async function POST(request: Request) {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "PRINT_AGENT_TOKEN not configured" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as {
    kind?: unknown;
    id?: unknown;
    status?: unknown;
  };
  if (!isValidKind(b.kind)) {
    return NextResponse.json(
      { error: "kind must be 'reservation' | 'series'" },
      { status: 400 },
    );
  }
  if (typeof b.id !== "string" || !b.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!isValidStatus(b.status)) {
    return NextResponse.json(
      { error: "status must be 'printing' | 'completed' | 'failed'" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const table = b.kind === "series" ? "reservation_series" : "reservations";
  const { error } = await supabase
    .from(table)
    .update({ print_status: b.status })
    .eq("id", b.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 상세 페이지·목록 캐시 무효화 (Realtime 으로도 client 갱신)
  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(
    b.kind === "series" ? `/series/${b.id}` : `/reservations/${b.id}`,
  );

  return NextResponse.json({ ok: true });
}
