import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBuildings,
  getFixedEvents,
  getFloors,
  getRooms,
} from "@/lib/repo";
import { FixedEventsAdmin } from "./fixed-events-admin";

// 0010 마이그레이션이 적용되기 전에는 fixed_events 테이블이 없을 수 있다.
// 빌드 시 prerender 가 실패하지 않도록 동적 렌더링 강제.
export const dynamic = "force-dynamic";

export default async function AdminFixedEventsPage() {
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

  const [events, buildings, floors, rooms] = await Promise.all([
    getFixedEvents({ includeInactive: true }),
    getBuildings(),
    getFloors(),
    getRooms(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold">고정 행사</h1>
        <p className="mb-6 text-sm text-stone-500">
          주일 예배·수요예배처럼 매주 정기적으로 같은 시간·호실을 쓰는 행사를
          미리 등록해 두는 곳입니다. 일반 신청과 별개라 결재 절차가 없습니다.
        </p>
        <FixedEventsAdmin
          initialEvents={events}
          buildings={buildings}
          floors={floors}
          rooms={rooms}
        />
      </main>
    </>
  );
}
