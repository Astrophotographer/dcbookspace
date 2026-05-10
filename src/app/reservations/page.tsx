import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { ReservationDetail, SeriesDetail } from "@/lib/repo";
import type { TableEntry } from "@/components/reservations-table";
import { computeConflictGroups, type ConflictRow } from "@/lib/conflicts";
import { isAdmin } from "@/lib/admin-server";
import { ReservationsList } from "./reservations-list";

export default async function ReservationsListPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }

  const supabase = createServiceClient();

  // 일회성 신청 (시리즈 자식 제외)
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
    .order("created_at", { ascending: false })
    .limit(200);

  // 시리즈 (한 행으로 묶어서 표시)
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
    .order("created_at", { ascending: false })
    .limit(200);

  // 충돌 검사용 — 시리즈 자식 포함, pending/approved 만
  const conflictRowsP = supabase
    .from("reservations")
    .select("id, room_id, start_at, end_at, series_id")
    .in("status", ["pending", "approved"]);

  const [{ data: rData }, { data: sData }, { data: cData }, admin] =
    await Promise.all([reservationsP, seriesP, conflictRowsP, isAdmin()]);

  const reservations = (rData ?? []) as unknown as ReservationDetail[];
  const seriesList = (sData ?? []) as unknown as SeriesDetail[];
  const conflictRows = (cData ?? []) as unknown as ConflictRow[];

  const { byReservation, bySeries, clusterOrder } =
    computeConflictGroups(conflictRows);
  const indexFor = (clusterId: string | undefined) =>
    clusterId == null ? undefined : clusterOrder.indexOf(clusterId);

  const entries: TableEntry[] = [
    ...reservations.map<TableEntry>((r) => ({
      kind: "reservation",
      data: r,
      conflictGroupIndex: indexFor(byReservation.get(r.id)),
    })),
    ...seriesList.map<TableEntry>((s) => ({
      kind: "series",
      data: {
        id: s.id,
        ref_no: s.ref_no,
        created_at: s.created_at,
        applicant: s.applicant,
        dept: s.dept,
        room: s.room,
        weekday: s.weekday,
        start_date: s.start_date,
        end_date: s.end_date,
        time_blocks: s.time_blocks,
        occurrence_count:
          s.reservations.length / Math.max(1, s.time_blocks.length),
        status: s.status,
        current_step: s.current_step,
        route: s.route,
        approvals: s.approvals,
        print_status: s.print_status,
      },
      conflictGroupIndex: indexFor(bySeries.get(s.id)),
    })),
  ];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">모든 신청내역</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">
              총 {entries.length}건
            </span>
            {admin && (
              // 종이 신청서를 직접 입력하는 admin 셀프-등록 진입.
              // /admin/reservations 와 동일하게 모든 신청내역 페이지에서도 노출.
              <Link
                href="/admin/reservations/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                title="종이 신청서를 받아 관리자가 직접 등록"
              >
                <Plus className="h-4 w-4" aria-hidden />
                신청서 직접 등록
              </Link>
            )}
            {admin && (
              // CSV 라우트로 직접 a href 다운로드 — server 가 Content-Disposition
              // 헤더로 파일명·attachment 지정해 클릭 한 번에 저장됨.
              <a
                href="/api/admin/reservations/csv"
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                title="모든 신청내역을 CSV(엑셀) 파일로 다운로드"
              >
                <Download className="h-4 w-4" aria-hidden />
                엑셀 다운로드
              </a>
            )}
          </div>
        </div>
        <ReservationsList entries={entries} isAdmin={admin} />
      </main>
    </>
  );
}
