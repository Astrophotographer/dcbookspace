// NAS 에이전트 → Vercel: 인쇄 대기 중인 신청서 목록 조회.
//
// Authorization 헤더:  Bearer <PRINT_AGENT_TOKEN>
// Query: 없음
// 응답:
//   200 {
//     jobs: [
//       {
//         kind: "reservation" | "series",
//         id: "<uuid>",
//         ref_no: "26-0040",
//         print_url: "https://.../reservations/<id>/print"
//       },
//       ...
//     ]
//   }
//
// 에이전트는 이 목록을 받아 PDF 렌더 후 프린터로 전송하고,
// /api/print/status 로 결과 보고.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveBaseUrl } from "@/lib/utils";
import { getPrintEnabled } from "@/lib/site-settings";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type Job = {
  kind: "reservation" | "series";
  id: string;
  ref_no: string | null;
  print_url: string;
};

export async function GET(request: Request) {
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

  // 사이트-와이드 프린트 토글 OFF — agent 가 폴링해도 빈 목록 반환.
  // 어드민이 다시 ON 으로 돌리면 그때부터 다시 작업이 노출됨.
  if (!(await getPrintEnabled())) {
    return NextResponse.json({ jobs: [] });
  }

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });

  const supabase = createServiceClient();
  const [r, s] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, ref_no")
      .eq("print_status", "requested")
      .is("series_id", null)
      .order("print_status_at"),
    supabase
      .from("reservation_series")
      .select("id, ref_no")
      .eq("print_status", "requested")
      .order("print_status_at"),
  ]);

  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });

  const jobs: Job[] = [
    ...(r.data ?? []).map<Job>((row) => ({
      kind: "reservation",
      id: row.id,
      ref_no: row.ref_no,
      print_url: `${baseUrl}/reservations/${row.id}/print`,
    })),
    ...(s.data ?? []).map<Job>((row) => ({
      kind: "series",
      id: row.id,
      ref_no: row.ref_no,
      print_url: `${baseUrl}/series/${row.id}/print`,
    })),
  ];

  void request; // unused but kept in signature
  return NextResponse.json({ jobs });
}
