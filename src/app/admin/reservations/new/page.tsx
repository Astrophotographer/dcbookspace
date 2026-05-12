import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBuildings,
  getFloors,
  getRooms,
  getDepartments,
} from "@/lib/repo";
import { getPrintEnabled } from "@/lib/site-settings";
import { ApplyForm } from "@/app/apply/apply-form";

/**
 * 종이 신청서를 본 관리자가 직접 등록하는 셀프-등록 페이지.
 * 사용자 신청 폼([app/apply/apply-form.tsx](../../apply/apply-form.tsx))을 그대로 재사용하고,
 * `adminMode` 프롭으로 결재 단계만 우회한다.
 */
export default async function AdminNewReservationPage() {
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

  const [buildings, floors, rooms, departments, printEnabled] =
    await Promise.all([
      getBuildings(),
      getFloors(),
      getRooms(),
      getDepartments(),
      getPrintEnabled(),
    ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-3 text-sm text-stone-500">
          <Link href="/admin/reservations" className="hover:underline">
            ← 신청서 관리
          </Link>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-stone-900">
          신청서 직접 등록
        </h1>
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          종이 신청서를 받아서 관리자가 대신 입력하는 화면입니다. 등록과 동시에{" "}
          <strong>결재 없이 예약 확정</strong>되어 현황판에 노출됩니다.
        </p>
        <ApplyForm
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          departments={departments}
          adminMode
          printEnabled={printEnabled}
        />
      </main>
    </>
  );
}
