import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getBuildings,
  getDepartments,
  getFloors,
  getRooms,
} from "@/lib/repo";
import type { ReservationDetail } from "@/lib/repo";
import { EditReservationGate } from "./edit-gate";

export default async function EditReservationPage(
  props: PageProps<"/reservations/[id]/edit">,
) {
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
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const r = data as unknown as ReservationDetail;

  const [buildings, floors, rooms, departments] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getDepartments(),
  ]);

  // start_at / end_at(ISO with timezone) → KST 기준 date / time 분리
  const start = new Date(r.start_at);
  const end = new Date(r.end_at);
  const kst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const kstTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const startDate = kst.format(start);
  const endDate = kst.format(end);
  const startTime = kstTime.format(start);
  const endTime = kstTime.format(end);

  const editable = r.status === "pending" && r.current_step === 1;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">
          장소사용 신청 수정
        </h1>
        <p className="mb-6 text-sm text-stone-500">
          신청번호 <span className="font-mono">#{r.ref_no}</span> · 신청자{" "}
          {r.applicant.name}
        </p>
        <EditReservationGate
          reservationId={r.id}
          applicantName={r.applicant.name}
          applicantPhone={r.applicant.phone ?? ""}
          editable={editable}
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          departments={departments}
          defaults={{
            applicant_name: r.applicant.name,
            applicant_phone: r.applicant.phone ?? "",
            dept_id: r.dept_id ?? "",
            building_id: r.room.floor.building_id,
            floor_id: r.room.floor_id,
            room_id: r.room_id,
            date: startDate,
            end_date: endDate,
            start_time: startTime,
            end_time: endTime,
            purpose: r.purpose,
            attendee_count: r.attendee_count,
            is_external: r.is_external,
            notes: r.notes ?? "",
          }}
        />
      </main>
    </>
  );
}
