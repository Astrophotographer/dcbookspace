import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { DateView } from "@/components/date-view";
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

  // Header + h1 만 즉시 렌더 → 첫 바이트(TTFB)가 빨라지고, 무거운 fetch 는
  // ReservationsArea 안에서 streaming.
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">예약 현황</h1>
        <Suspense fallback={<HomeSkeleton />} key={dateStr}>
          <ReservationsArea dateStr={dateStr} />
        </Suspense>
      </main>
    </>
  );
}

async function ReservationsArea({ dateStr }: { dateStr: string }) {
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

  // monthReservations 한 번만 fetch, dayReservations 는 메모리 필터로 derive.
  // master fetch 들은 cache() 로 래핑되어 같은 요청 안에서 재호출되어도 무료.
  const [buildings, floors, rooms, monthReservations, fixedEvents] =
    await Promise.all([
      getBuildings(),
      getFloors(),
      getRooms(),
      getReservationsBetween(monthStart, monthEnd),
      getFixedEvents(),
    ]);

  const dayReservations = monthReservations.filter(
    (r) => r.start_at < dayEnd && r.end_at > dayStart,
  );
  const dayFixedEvents = expandFixedEvents(fixedEvents, dateStr, dateStr);

  return (
    <HomeTabs
      dateView={
        <DateView currentDate={dateStr} reservations={monthReservations} />
      }
      buildingViewProps={{
        currentDate: dateStr,
        buildings,
        floors,
        rooms,
        reservations: dayReservations,
        fixedEvents: dayFixedEvents,
      }}
    />
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-48 animate-pulse rounded-full bg-stone-100" />
      <div className="h-[28rem] w-full animate-pulse rounded-2xl bg-stone-100" />
    </div>
  );
}
