import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { ApplyForm } from "./apply-form";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBuildings,
  getFloors,
  getRooms,
  getDepartments,
} from "@/lib/repo";

export default async function ApplyPage(props: PageProps<"/apply">) {
  // 키오스크 모드 — ?kiosk=1 일 때 헤더·푸터 숨기고 신청 전용 화면.
  const sp = await props.searchParams;
  const isKiosk = sp.kiosk === "1";

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader kiosk={isKiosk} />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }

  const [buildings, floors, rooms, departments] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getDepartments(),
  ]);

  return (
    <>
      <SiteHeader kiosk={isKiosk} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <h1 className="mb-6 text-[28px] font-bold tracking-tight text-stone-900 sm:text-[34px]">
          장소사용 신청
        </h1>
        <ApplyForm
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          departments={departments}
        />
      </main>
    </>
  );
}
