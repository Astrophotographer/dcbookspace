import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unauthorized, verifyApiToken } from "@/lib/api-auth";
import { submitApplication } from "@/app/apply/actions";
import { resolveBaseUrl } from "@/lib/utils";
import { headers } from "next/headers";

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

// ---- POST /api/v1/reservations ----------------------------------------------

type CreateBody = {
  applicant_name: string;
  applicant_phone: string;
  dept_id: string;
  room_id: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD. 미지정 시 date 와 동일 (단일일 신청) */
  end_date?: string;
  /** HH:MM (24h) */
  start_time: string;
  end_time: string;
  purpose: string;
  attendee_count: number;
  is_external?: boolean;
  notes?: string;
  /** 충돌이 있어도 강제로 진행할지. 기본 false → 충돌 시 409 응답 */
  force_overlap?: boolean;
};

const REQUIRED_FIELDS: (keyof CreateBody)[] = [
  "applicant_name",
  "applicant_phone",
  "dept_id",
  "room_id",
  "date",
  "start_time",
  "end_time",
  "purpose",
  "attendee_count",
];

/**
 * POST /api/v1/reservations
 *
 * 외부(텔레그램 봇 등)에서 일회성 신청서를 만든다. 정기 신청은 별도 endpoint
 * (현재 미지원).
 *
 * 응답
 *   201 Created — { id, ref_no, status, detail_url, sign_url }
 *   400 — 필수 필드 누락 / 형식 오류 / 휴대폰 검증 실패
 *   401 — 토큰 불일치
 *   409 — 같은 호실·시간 충돌. 클라이언트가 사용자에게 확인 후 force_overlap=true
 *         로 재시도하면 됨
 */
export async function POST(req: Request) {
  if (!verifyApiToken(req)) return unauthorized();

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }

  for (const k of REQUIRED_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null || v === "") {
      return NextResponse.json(
        { error: `missing field: ${k}` },
        { status: 400 },
      );
    }
  }

  // submitApplication 은 FormData 시그니처 — 외부 JSON 을 그대로 변환해
  // 기존 검증·결재선·트리거 로직을 그대로 재사용.
  const fd = new FormData();
  fd.set("applicant_name", String(body.applicant_name).trim());
  fd.set("applicant_phone", String(body.applicant_phone).trim());
  fd.set("dept_id", String(body.dept_id));
  fd.set("room_id", String(body.room_id));
  fd.set("date", String(body.date));
  fd.set("end_date", String(body.end_date ?? body.date));
  fd.set("start_time", String(body.start_time));
  fd.set("end_time", String(body.end_time));
  fd.set("purpose", String(body.purpose).trim());
  fd.set("attendee_count", String(body.attendee_count));
  if (body.is_external) fd.set("is_external", "on");
  if (body.notes) fd.set("notes", String(body.notes));

  const result = await submitApplication(fd, {
    forceOverlap: !!body.force_overlap,
  });

  if (result.error) {
    // DB 트리거가 던지는 충돌 메시지는 한국어로 "이미 예약" 포함 — 409 로 매핑
    const isConflict =
      result.error.includes("이미 예약") ||
      result.error.includes("force_overlap");
    return NextResponse.json(
      { error: result.error },
      { status: isConflict ? 409 : 400 },
    );
  }

  // 응답에 ref_no + 외부에서 바로 열 수 있는 URL 같이 돌려준다
  const supabase = createServiceClient();
  const { data: created } = await supabase
    .from("reservations")
    .select("ref_no, qr_token")
    .eq("id", result.id!)
    .single();

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });

  return NextResponse.json(
    {
      id: result.id,
      ref_no: created?.ref_no ?? null,
      status: "pending",
      detail_url: `${baseUrl}/reservations/${result.id}`,
      sign_url: created?.qr_token
        ? `${baseUrl}/sign/${created.qr_token}`
        : null,
    },
    { status: 201 },
  );
}
