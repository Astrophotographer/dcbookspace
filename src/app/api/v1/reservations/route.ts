import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unauthorized, verifyApiToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  ref_no: string | null;
  status: string;
  start_at: string;
  end_at: string;
  purpose: string;
  created_at: string;
  series_id: string | null;
  applicant: { name: string; phone: string | null };
  dept: { name: string } | null;
  room: {
    id: string;
    name: string;
    floor: { label: string; building: { name: string } };
  };
};

const ALLOWED_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

/**
 * GET /api/v1/reservations
 *
 * Query params:
 *   - from        YYYY-MM-DD   사용 시작일 lower bound (선택)
 *   - to          YYYY-MM-DD   사용 종료일 upper bound (선택)
 *   - room_id     uuid         특정 호실로 필터 (선택)
 *   - status      enum|"active"|"all"  기본 "active" (=pending+approved)
 *                 단일 status 값을 주면 그것만, "all" 이면 모두
 *   - limit       기본 100, 최대 500
 *   - offset      기본 0
 *
 * 시리즈 자식(series_id != null)도 실제 점유이므로 그대로 포함.
 */
export async function GET(req: Request) {
  if (!verifyApiToken(req)) return unauthorized();

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const roomId = url.searchParams.get("room_id");
  const statusParam = url.searchParams.get("status") ?? "active";
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? 0) || 0,
  );

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json(
      { error: "from must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: "to must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (
    statusParam !== "active" &&
    statusParam !== "all" &&
    !ALLOWED_STATUSES.has(statusParam)
  ) {
    return NextResponse.json(
      {
        error: `invalid status. allowed: active | all | ${[...ALLOWED_STATUSES].join(" | ")}`,
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  let q = supabase
    .from("reservations")
    .select(
      `id, ref_no, status, start_at, end_at, purpose, created_at, series_id,
       applicant:users!applicant_id (name, phone),
       dept:departments (name),
       room:rooms (id, name, floor:floors (label, building:buildings (name)))`,
      { count: "exact" },
    )
    .order("start_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) q = q.gte("end_at", `${from}T00:00:00+09:00`);
  if (to) q = q.lte("start_at", `${to}T23:59:59+09:00`);
  if (roomId) q = q.eq("room_id", roomId);
  if (statusParam === "active") {
    q = q.in("status", ["pending", "approved"]);
  } else if (statusParam !== "all") {
    q = q.eq("status", statusParam);
  }

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  return NextResponse.json({
    total: count ?? 0,
    limit,
    offset,
    results: rows.map((r) => ({
      id: r.id,
      ref_no: r.ref_no,
      status: r.status,
      start_at: r.start_at,
      end_at: r.end_at,
      purpose: r.purpose,
      created_at: r.created_at,
      is_recurring: r.series_id != null,
      applicant: {
        name: r.applicant.name,
        phone: r.applicant.phone,
      },
      dept_name: r.dept?.name ?? null,
      room: {
        id: r.room.id,
        name: r.room.name,
        floor_label: r.room.floor.label,
        building_name: r.room.floor.building.name,
      },
    })),
  });
}
