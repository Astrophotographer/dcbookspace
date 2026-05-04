import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { getBuildings, getFloors, getRooms } from "@/lib/repo";
import { RoomsAdmin } from "./rooms-admin";

export default async function AdminRoomsPage() {
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

  const [buildings, floors, rooms] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">건물·호실 관리</h1>
        <RoomsAdmin buildings={buildings} floors={floors} rooms={rooms} />
      </main>
    </>
  );
}
