import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBuildings,
  getDepartments,
  getFloors,
  getRooms,
  getSeries,
} from "@/lib/repo";
import { EditSeriesGate } from "./edit-gate";

export const dynamic = "force-dynamic";

type PageArgs = {
  params: Promise<{ id: string }>;
};

export default async function EditSeriesPage(props: PageArgs) {
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

  const { id } = await props.params;
  const series = await getSeries(id);
  if (!series) notFound();

  const [buildings, floors, rooms, departments] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getDepartments(),
  ]);

  const editable =
    series.status === "pending" && series.current_step === 1;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">
          정기 신청 수정
        </h1>
        <p className="mb-6 text-sm text-stone-500">
          신청번호 <span className="font-mono">#{series.ref_no}</span> · 신청자{" "}
          {series.applicant.name}
        </p>
        <EditSeriesGate
          seriesId={series.id}
          applicantName={series.applicant.name}
          applicantPhone={series.applicant.phone ?? ""}
          editable={editable}
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          departments={departments}
          defaults={{
            applicant_name: series.applicant.name,
            applicant_phone: series.applicant.phone ?? "",
            dept_id: series.dept_id ?? "",
            building_id: series.room.floor.building_id,
            floor_id: series.room.floor_id,
            room_id: series.room_id,
            date: series.start_date,
            end_date: series.end_date,
            // 시리즈는 time_blocks 가 진실. 비호출 필드는 fallback 으로 첫 블록 사용.
            start_time: series.time_blocks[0]?.start ?? "09:00",
            end_time: series.time_blocks[0]?.end ?? "11:00",
            purpose: series.purpose,
            attendee_count: series.attendee_count,
            is_external: series.is_external,
            notes: series.notes ?? "",
            recurring: true,
            time_blocks: series.time_blocks,
          }}
        />
      </main>
    </>
  );
}
