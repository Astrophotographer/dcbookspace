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

export default async function ApplyPage() {
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

  const [buildings, floors, rooms, departments] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getDepartments(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">
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
