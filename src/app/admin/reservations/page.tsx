import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { ReservationBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { ReservationDetail } from "@/lib/repo";

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
          <h1 className="text-2xl font-bold">신청서 관리</h1>
          <span className="text-sm text-stone-500">총 {list.length}건</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-700">
              <tr>
                <Th>신청번호</Th>
                <Th>작성일</Th>
                <Th>부서 / 신청자</Th>
                <Th>장소</Th>
                <Th>사용일시</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                >
                  <Td>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="font-mono text-brand-700 hover:underline"
                    >
                      #{r.ref_no ?? r.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block"
                    >
                      {formatDateTime(r.created_at)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block"
                    >
                      <span className="font-medium">
                        {r.dept?.name ?? "-"}
                      </span>
                      <span className="ml-2 text-stone-500">
                        {r.applicant.name}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block"
                    >
                      {r.room.floor.building.name} {r.room.floor.label}{" "}
                      {r.room.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="block"
                    >
                      <div className="text-stone-700">
                        {formatDateTime(r.start_at)}
                      </div>
                      <div className="text-xs text-stone-500">
                        ~ {formatDateTime(r.end_at)}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <ReservationBadge reservation={r} />
                  </Td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-stone-500"
                  >
                    아직 작성된 신청서가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
