import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ReservationDetail, SeriesDetail } from "@/lib/repo";
import { displayStatus, STATUS_LABEL } from "@/lib/reservation-status";
import { computeConflictGroups, type ConflictRow } from "@/lib/conflicts";
import { weekdayLabel } from "@/lib/recurrence";
import { formatDateTime } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// "결재 라인" 컬럼 표기 — 마지막으로 통과(approved)한 단계 라벨.
// 한 단계도 통과 못했으면 "-".
const ROLE_LABEL: Record<UserRole, string> = {
  applicant: "신청자",
  dept_head: "부서장",
  manager: "차장",
  elder: "관리장로",
  senior_pastor: "당회장",
  admin: "관리자",
};

function lastApprovedLabel(
  approvals: ReservationDetail["approvals"],
  route: ReservationDetail["route"],
): string {
  let maxStep = -1;
  let role: UserRole | null = null;
  for (const a of approvals) {
    if (a.status !== "approved") continue;
    if (a.step_order > maxStep) {
      maxStep = a.step_order;
      const step = route.steps.find((s) => s.order === a.step_order);
      role = step?.role ?? null;
    }
  }
  return role ? `${ROLE_LABEL[role]} 통과` : "-";
}

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function row(values: (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

export async function GET() {
  if (!(await isAdmin())) {
    return new NextResponse("관리자 권한이 필요합니다.", { status: 401 });
  }

  const supabase = createServiceClient();

  const reservationsP = supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .is("series_id", null)
    .order("created_at", { ascending: false });

  const seriesP = supabase
    .from("reservation_series")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*),
       reservations (id, start_at, end_at, status, ref_no)`,
    )
    .order("created_at", { ascending: false });

  // 충돌 그룹 — pending/approved 만, 시리즈 자식 포함
  const conflictRowsP = supabase
    .from("reservations")
    .select("id, room_id, start_at, end_at, series_id")
    .in("status", ["pending", "approved"]);

  const [{ data: rData }, { data: sData }, { data: cData }] = await Promise.all([
    reservationsP,
    seriesP,
    conflictRowsP,
  ]);

  const reservations = (rData ?? []) as unknown as ReservationDetail[];
  const seriesList = (sData ?? []) as unknown as SeriesDetail[];
  const conflictRows = (cData ?? []) as unknown as ConflictRow[];

  const { byReservation, bySeries, clusterOrder } =
    computeConflictGroups(conflictRows);
  const indexFor = (clusterId: string | undefined) =>
    clusterId == null ? "" : String(clusterOrder.indexOf(clusterId) + 1);

  const headers = [
    "종류",
    "신청번호",
    "작성일",
    "상태",
    "부서",
    "신청자",
    "전화번호",
    "건물",
    "층",
    "호실",
    "사용 시작 / 요일",
    "사용 종료 / 시간대",
    "회차",
    "외부행사",
    "결재선",
    "결재 진행",
    "인쇄 상태",
    "충돌 그룹",
    "목적",
    "비고",
  ];

  const lines: string[] = [row(headers)];

  for (const r of reservations) {
    lines.push(
      row([
        "일회성",
        r.ref_no ?? r.id.slice(0, 8),
        formatDateTime(r.created_at),
        STATUS_LABEL[displayStatus(r)],
        r.dept?.name ?? "",
        r.applicant.name,
        r.applicant.phone ?? "",
        r.room.floor.building.name,
        r.room.floor.label,
        r.room.name,
        formatDateTime(r.start_at),
        formatDateTime(r.end_at),
        "", // 회차 — 일회성은 없음
        r.is_external ? "예" : "아니오",
        r.route.name,
        lastApprovedLabel(r.approvals, r.route),
        r.print_status,
        indexFor(byReservation.get(r.id)),
        r.purpose,
        r.notes ?? "",
      ]),
    );
  }

  for (const s of seriesList) {
    const occurrenceCount =
      s.reservations.length / Math.max(1, s.time_blocks.length);
    const timeBlocksLabel = s.time_blocks
      .map((b) => `${b.start}–${b.end}`)
      .join(" / ");
    lines.push(
      row([
        "정기",
        s.ref_no ?? s.id.slice(0, 8),
        formatDateTime(s.created_at),
        STATUS_LABEL[
          displayStatus({ status: s.status, approvals: s.approvals })
        ],
        s.dept?.name ?? "",
        s.applicant.name,
        s.applicant.phone ?? "",
        s.room.floor.building.name,
        s.room.floor.label,
        s.room.name,
        `매주 ${weekdayLabel(s.weekday)} (${s.start_date} ~ ${s.end_date})`,
        timeBlocksLabel,
        `${occurrenceCount}회 × ${s.time_blocks.length}시간대 = ${s.reservations.length}개`,
        s.is_external ? "예" : "아니오",
        s.route.name,
        lastApprovedLabel(s.approvals, s.route),
        s.print_status,
        indexFor(bySeries.get(s.id)),
        s.purpose,
        s.notes ?? "",
      ]),
    );
  }

  // 한국어 셀이 Excel 에서 깨지지 않도록 UTF-8 BOM 선두 부여.
  // Windows Excel 은 BOM 없으면 cp949 로 잘못 해석.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  // 다운로드 파일명 — 한국 시간 기준 yyyyMMdd-HHmm 으로 매번 달라지게.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC → KST 보정
  const stamp = kst
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, "")
    .slice(0, 13); // yyyyMMddHHmm
  const filename = `reservations-${stamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
