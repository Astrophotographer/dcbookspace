import Link from "next/link";
import { Plus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { ReservationsAdmin } from "./reservations-admin";
import type { ReservationDetail, SeriesDetail } from "@/lib/repo";
import type { TableEntry } from "@/components/reservations-table";
import { computeConflictGroups, type ConflictRow } from "@/lib/conflicts";
import { getPrintEnabled } from "@/lib/site-settings";
import { getAdminSession } from "@/lib/admin-server";
import { isFullAdminSession } from "@/lib/admin-session";
import { canGuideElderSeeOwnDeptRow } from "@/lib/guide-elder-access";
import { getGuideElderScopeForSession } from "@/lib/guide-elder-identity";

type ConflictBounds = {
  roomIds: string[];
  minStartIso: string;
  maxEndIso: string;
};

function conflictBoundsFor(
  reservations: ReservationDetail[],
  seriesList: SeriesDetail[],
): ConflictBounds | null {
  const roomIds = new Set<string>();
  const starts: number[] = [];
  const ends: number[] = [];

  const addWindow = (roomId: string, startAt: string, endAt: string) => {
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    roomIds.add(roomId);
    starts.push(start);
    ends.push(end);
  };

  for (const r of reservations) addWindow(r.room_id, r.start_at, r.end_at);
  for (const s of seriesList) {
    for (const r of s.reservations) {
      addWindow(s.room_id, r.start_at, r.end_at);
    }
  }

  if (roomIds.size === 0 || starts.length === 0 || ends.length === 0) return null;

  return {
    roomIds: [...roomIds],
    minStartIso: new Date(Math.min(...starts)).toISOString(),
    maxEndIso: new Date(Math.max(...ends)).toISOString(),
  };
}

export default async function AdminReservationsListPage() {
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

  const [printEnabled, adminSession] = await Promise.all([
    getPrintEnabled(),
    getAdminSession(),
  ]);
  const fullAdmin = isFullAdminSession(adminSession);
  const guideElderScope = fullAdmin
    ? { elderIds: [], departmentIds: [] }
    : await getGuideElderScopeForSession(supabase, adminSession);
  const guideElderIds = guideElderScope.elderIds;
  const guideDeptIds = guideElderScope.departmentIds;

  let rData: unknown[] | null = [];
  let sData: unknown[] | null = [];

  if (fullAdmin || guideDeptIds.length > 0) {
    let reservationsQuery = supabase
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
    if (!fullAdmin) reservationsQuery = reservationsQuery.in("dept_id", guideDeptIds);

    let seriesQuery = supabase
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
    if (!fullAdmin) seriesQuery = seriesQuery.in("dept_id", guideDeptIds);

    const [{ data: loadedReservations }, { data: loadedSeries }] =
      await Promise.all([reservationsQuery, seriesQuery]);

    rData = loadedReservations;
    sData = loadedSeries;
  }

  const reservations = (rData ?? []) as unknown as ReservationDetail[];
  const seriesList = (sData ?? []) as unknown as SeriesDetail[];
  const conflictBounds = conflictBoundsFor(reservations, seriesList);
  let conflictRows: ConflictRow[] = [];
  if (conflictBounds) {
    const { data: cData } = await supabase
      .from("reservations")
      .select("id, room_id, start_at, end_at, series_id")
      .in("status", ["pending", "approved"])
      .in("room_id", conflictBounds.roomIds)
      .lt("start_at", conflictBounds.maxEndIso)
      .gt("end_at", conflictBounds.minStartIso);
    conflictRows = (cData ?? []) as unknown as ConflictRow[];
  }

  const { byReservation, bySeries, clusterOrder } =
    computeConflictGroups(conflictRows);
  const indexFor = (clusterId: string | undefined) =>
    clusterId == null ? undefined : clusterOrder.indexOf(clusterId);

  const allEntries: TableEntry[] = [
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
        print_completed_count: s.print_completed_count,
      },
      conflictGroupIndex: indexFor(bySeries.get(s.id)),
    })),
  ];
  const entries = fullAdmin
    ? allEntries
    : allEntries.filter((entry) =>
        canGuideElderSeeOwnDeptRow(entry.data, adminSession, guideElderIds),
      );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">신청서 관리</h1>
            <span className="text-sm text-stone-500">총 {entries.length}건</span>
          </div>
          {fullAdmin && (
            <Link
              href="/admin/reservations/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              신청서 직접 등록
            </Link>
          )}
        </div>

        <ReservationsAdmin entries={entries} printEnabled={printEnabled} />
      </main>
    </>
  );
}
