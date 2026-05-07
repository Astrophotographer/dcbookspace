import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unauthorized, verifyApiToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  ref_no: string | null;
  start_at: string;
  end_at: string;
  status: string;
  purpose: string;
  series_id: string | null;
  applicant: { name: string; phone: string | null };
  dept: { name: string } | null;
};

/**
 * GET /api/v1/rooms/:room_id/schedule?date=YYYY-MM-DD
 *
 * 특정 호실의 특정 날짜 일정. pending + approved 만(반려·취소된 건 제외).
 * 응답:
 *   - available: 그 날 해당 호실에 활성 신청이 0건이면 true
 *   - reservations: 활성 신청 목록 (신청자·부서·시간·목적 포함)
 *
 * 시리즈 자식(series_id != null) 도 실제 시간 점유이므로 그대로 포함한다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ room_id: string }> },
) {
  if (!verifyApiToken(req)) return unauthorized();

  const { room_id } = await params;
  if (!room_id) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query parameter is required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd = `${date}T23:59:59+09:00`;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, ref_no, start_at, end_at, status, purpose, series_id,
       applicant:users!applicant_id (name, phone),
       dept:departments (name)`,
    )
    .eq("room_id", room_id)
    .lt("start_at", dayEnd)
    .gt("end_at", dayStart)
    .in("status", ["pending", "approved"])
    .order("start_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  return NextResponse.json({
    room_id,
    date,
    available: rows.length === 0,
    reservations: rows.map((r) => ({
      id: r.id,
      ref_no: r.ref_no,
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      purpose: r.purpose,
      is_recurring: r.series_id != null,
      applicant: {
        name: r.applicant.name,
        phone: r.applicant.phone,
      },
      dept_name: r.dept?.name ?? null,
    })),
  });
}
