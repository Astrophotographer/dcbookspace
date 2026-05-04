import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { ApprovalTracker } from "@/components/approval-tracker";
import { ReservationBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { ReservationDetail } from "@/lib/repo";

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
       approvals (*),
       route:approval_routes (*)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const list = (data ?? []) as unknown as ReservationDetail[];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">최근 신청 내역</h1>
        <ul className="space-y-3">
          {list.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/reservations/${r.id}`}
                  className="font-semibold text-stone-900 hover:text-brand-600"
                >
                  #{r.ref_no} · {r.dept?.name} · {r.purpose}
                </Link>
                <ReservationBadge reservation={r} />
              </div>
              <p className="mb-2 text-sm text-stone-600">
                {r.room.floor.building.name} {r.room.floor.label}{" "}
                {r.room.name} · {formatDateTime(r.start_at)}
              </p>
              <ApprovalTracker
                route={r.route}
                approvals={r.approvals}
                currentStep={r.current_step}
                compact
              />
            </li>
          ))}
          {list.length === 0 && (
            <li className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">
              아직 신청 내역이 없습니다.
            </li>
          )}
        </ul>
      </main>
    </>
  );
}
