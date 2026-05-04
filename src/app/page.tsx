import { SiteHeader } from "@/components/site-header";
import { DatePicker } from "@/components/date-picker";
import { DateView } from "@/components/date-view";
import { BuildingView } from "@/components/building-view";
import { HomeTabs } from "@/components/home-tabs";
import { SetupNeeded } from "@/components/setup-needed";
import {
  getBuildings,
  getFloors,
  getRooms,
  getReservationsBetween,
} from "@/lib/repo";
import { isSupabaseConfigured } from "@/lib/config";
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export default async function Home(props: PageProps<"/">) {
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

  const sp = await props.searchParams;
  const dateStr =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : format(new Date(), "yyyy-MM-dd");

  const date = parseISO(dateStr);
  const monthGridStart = format(
    startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
    "yyyy-MM-dd",
  );
  const monthGridEnd = format(
    endOfWeek(endOfMonth(date), { weekStartsOn: 0 }),
    "yyyy-MM-dd",
  );

  const dayStart = `${dateStr}T00:00:00+09:00`;
  const dayEnd = `${dateStr}T23:59:59+09:00`;
  const monthStart = `${monthGridStart}T00:00:00+09:00`;
  const monthEnd = `${monthGridEnd}T23:59:59+09:00`;

  const [
    buildings,
    floors,
    rooms,
    dayReservations,
    monthReservations,
  ] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getReservationsBetween(dayStart, dayEnd),
    getReservationsBetween(monthStart, monthEnd),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">예약 현황</h1>
          <DatePicker value={dateStr} />
        </div>

        <HomeTabs
          dateView={
            <DateView
              currentDate={dateStr}
              reservations={monthReservations}
            />
          }
          placeView={
            <BuildingView
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              reservations={dayReservations}
            />
          }
        />
      </main>
    </>
  );
}
