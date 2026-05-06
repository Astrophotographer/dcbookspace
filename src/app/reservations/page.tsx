import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { ReservationDetail } from "@/lib/repo";
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
  const { data } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (data ?? []) as unknown as ReservationDetail[];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">모든 신청내역</h1>
          <span className="text-sm text-stone-500">총 {list.length}건</span>
        </div>
        <ReservationsList reservations={list} />
      </main>
    </>
  );
}
