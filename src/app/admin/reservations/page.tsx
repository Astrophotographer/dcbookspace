import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { ReservationsAdmin } from "./reservations-admin";
import type { ReservationDetail, SeriesDetail } from "@/lib/repo";
import type { TableEntry } from "@/components/reservations-table";
import { computeConflictGroups, type ConflictRow } from "@/lib/conflicts";

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

  const conflictRowsP = supabase
    .from("reservations")
    .select("id, room_id, start_at, end_at, series_id")
    .in("status", ["pending", "approved"]);

  const [{ data: rData }, { data: sData }, { data: cData }] =
    await Promise.all([reservationsP, seriesP, conflictRowsP]);

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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">신청서 관리</h1>
          <span className="text-sm text-stone-500">총 {entries.length}건</span>
        </div>

        <ReservationsAdmin entries={entries} />
      </main>
    </>
  );
}
