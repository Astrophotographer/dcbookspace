import { SiteHeader } from "@/components/site-header";
import { DateView } from "@/components/date-view";
import { BuildingView } from "@/components/building-view";
import { HomeTabs } from "@/components/home-tabs";
import { SetupNeeded } from "@/components/setup-needed";
import {
  getBuildings,
  getFloors,
  getRooms,
  getReservationsBetween,
  getFixedEvents,
} from "@/lib/repo";
import { expandFixedEvents } from "@/lib/recurrence";
import { isSupabaseConfigured } from "@/lib/config";
import { addDays, format, parseISO, startOfWeek } from "date-fns";

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

  // DateView 그리드는 currentDate 가 속한 주를 1행으로 두고 6주를 펼친다.
  // 서버 fetch 범위도 그 6주에 맞춰서 가져온다.
  const date = parseISO(dateStr);
  const gridStart = startOfWeek(date, { weekStartsOn: 0 });
  const gridEnd = addDays(gridStart, 41);
  const monthGridStart = format(gridStart, "yyyy-MM-dd");
  const monthGridEnd = format(gridEnd, "yyyy-MM-dd");

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
    fixedEvents,
  ] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getReservationsBetween(dayStart, dayEnd),
    getReservationsBetween(monthStart, monthEnd),
    getFixedEvents(),
  ]);

  // 캘린더(DateView)에는 고정 행사 미표시 — 장소 뷰만 호실 상태에 함께 노출.
  const dayFixedEvents = expandFixedEvents(fixedEvents, dateStr, dateStr);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">예약 현황</h1>

        <HomeTabs
          dateView={
            <DateView
              currentDate={dateStr}
              reservations={monthReservations}
            />
          }
          placeView={
            <BuildingView
              currentDate={dateStr}
              buildings={buildings}
              floors={floors}
              rooms={rooms}
              reservations={dayReservations}
              fixedEvents={dayFixedEvents}
            />
          }
        />
      </main>
    </>
  );
}
