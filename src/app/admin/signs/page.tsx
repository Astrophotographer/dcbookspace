import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin-server";
import { isFullAdminSession, type AdminSession } from "@/lib/admin-session";
import { canGuideElderSeeOwnDeptRow } from "@/lib/guide-elder-access";
import { getGuideElderScopeForSession } from "@/lib/guide-elder-identity";
import { formatDateTime } from "@/lib/utils";
import { weekdayLabel } from "@/lib/recurrence";
import { ROLE_LABEL, type ApprovalStep, type TimeBlock } from "@/lib/supabase/types";
import {
  SignatureManager,
  type SignatureDepartment,
} from "./signature-manager";

type SignRoute = {
  name: string;
  steps: ApprovalStep[];
};

type RoomLite = {
  name: string;
  floor: {
    label: string;
    building: { name: string };
  };
};

type DeptLite = {
  id: string;
  name: string;
  elder_id: string | null;
};

type ApplicantLite = {
  name: string;
  phone: string | null;
};

type ReservationSignRow = {
  kind: "reservation";
  id: string;
  ref_no: string | null;
  qr_token: string;
  created_at: string;
  start_at: string;
  end_at: string;
  purpose: string;
  status: string;
  current_step: number;
  route: SignRoute;
  dept: DeptLite | null;
  room: RoomLite;
  applicant: ApplicantLite;
};

type SeriesSignRow = {
  kind: "series";
  id: string;
  ref_no: string | null;
  qr_token: string;
  created_at: string;
  weekday: number;
  start_date: string;
  end_date: string;
  time_blocks: TimeBlock[];
  purpose: string;
  status: string;
  current_step: number;
  route: SignRoute;
  dept: DeptLite | null;
  room: RoomLite;
  applicant: ApplicantLite;
};

type SignRow = ReservationSignRow | SeriesSignRow;

type SignatureDeptRow = {
  id: string;
  name: string;
  dept_head_signature_data_url: string | null;
  dept_head_signature_updated_at: string | null;
  elder_signature_data_url: string | null;
  elder_signature_updated_at: string | null;
  dept_head: { name: string } | null;
  elder: { name: string } | null;
};

function currentStep(row: SignRow): ApprovalStep | null {
  return row.route.steps.find((s) => s.order === row.current_step) ?? null;
}

function canSeeRow(
  row: SignRow,
  session: AdminSession,
  guideElderIds: readonly string[],
): boolean {
  const step = currentStep(row);
  if (!step) return false;
  return canGuideElderSeeOwnDeptRow(row, session, guideElderIds);
}

function rowTimeLabel(row: SignRow): string {
  if (row.kind === "reservation") {
    return `${formatDateTime(row.start_at)} ~ ${formatDateTime(row.end_at)}`;
  }
  const blocks = row.time_blocks.map((b) => `${b.start}-${b.end}`).join(" / ");
  return `매주 ${weekdayLabel(row.weekday)}요일 · ${blocks} · ${row.start_date} ~ ${row.end_date}`;
}

function rowSortKey(row: SignRow): string {
  if (row.kind === "reservation") return row.start_at;
  const block = row.time_blocks[0];
  return `${row.start_date}T${block?.start ?? "00:00"}:00+09:00`;
}

function kstDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function AdminSignsPage() {
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

  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/signs");

  const supabase = createServiceClient();
  const fullAdmin = isFullAdminSession(session);
  const guideElderScope = fullAdmin
    ? { elderIds: [], departmentIds: [] }
    : await getGuideElderScopeForSession(supabase, session);
  const guideElderIds = guideElderScope.elderIds;
  const guideDeptIds = guideElderScope.departmentIds;
  const today = kstDateString(new Date());
  let departmentData: unknown[] | null = [];
  let reservationData: unknown[] | null = [];
  let seriesData: unknown[] | null = [];

  if (fullAdmin || guideDeptIds.length > 0) {
    let departmentsQuery = supabase
      .from("departments")
      .select(
        `id, name,
         dept_head_signature_data_url, dept_head_signature_updated_at,
         elder_signature_data_url, elder_signature_updated_at,
         dept_head:users!dept_head_id (name),
         elder:users!elder_id (name)`,
      )
      .not("parent_id", "is", null)
      .order("display_order", { ascending: true });
    if (!fullAdmin) departmentsQuery = departmentsQuery.in("id", guideDeptIds);

    let reservationsQuery = supabase
      .from("reservations")
      .select(
        `id, ref_no, qr_token, created_at, start_at, end_at, purpose, current_step,
         status,
         room:rooms (name, floor:floors (label, building:buildings(name))),
         applicant:users!applicant_id (name, phone),
         dept:departments (id, name, elder_id),
         route:approval_routes (name, steps)`,
      )
      .eq("status", "pending")
      .is("series_id", null)
      .gte("end_at", `${today}T00:00:00+09:00`)
      .order("start_at", { ascending: true })
      .limit(200);
    if (!fullAdmin) reservationsQuery = reservationsQuery.in("dept_id", guideDeptIds);

    let seriesQuery = supabase
      .from("reservation_series")
      .select(
        `id, ref_no, qr_token, created_at, weekday, start_date, end_date,
         time_blocks, purpose, status, current_step,
         room:rooms (name, floor:floors (label, building:buildings(name))),
         applicant:users!applicant_id (name, phone),
         dept:departments (id, name, elder_id),
         route:approval_routes (name, steps)`,
      )
      .eq("status", "pending")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(200);
    if (!fullAdmin) seriesQuery = seriesQuery.in("dept_id", guideDeptIds);

    const [
      { data: loadedDepartments },
      { data: loadedReservations },
      { data: loadedSeries },
    ] = await Promise.all([departmentsQuery, reservationsQuery, seriesQuery]);

    departmentData = loadedDepartments;
    reservationData = loadedReservations;
    seriesData = loadedSeries;
  }

  const signatureDepartments: SignatureDepartment[] = (
    (departmentData ?? []) as unknown as SignatureDeptRow[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    deptHeadName: d.dept_head?.name ?? null,
    elderName: d.elder?.name ?? null,
    deptHeadSignatureDataUrl: d.dept_head_signature_data_url,
    deptHeadSignatureUpdatedAt: d.dept_head_signature_updated_at,
    elderSignatureDataUrl: d.elder_signature_data_url,
    elderSignatureUpdatedAt: d.elder_signature_updated_at,
  }));

  const rows: SignRow[] = [
    ...((reservationData ?? []) as unknown as Omit<ReservationSignRow, "kind">[])
      .map((r) => ({ ...r, kind: "reservation" as const })),
    ...((seriesData ?? []) as unknown as Omit<SeriesSignRow, "kind">[]).map(
      (s) => ({ ...s, kind: "series" as const }),
    ),
  ]
    .filter((row) => canSeeRow(row, session, guideElderIds))
    .sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b)));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">사인관리</h1>
          <p className="mt-1 text-sm text-stone-500">
            {fullAdmin
              ? "부서별 사인과 현재 결재 차례인 신청서를 확인합니다."
              : "담당 부서 사인과 담당 부서의 차장 결재 전 신청서를 확인합니다."}
          </p>
          </div>
          <Link
            href="/admin/reservations"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
          >
            <FileText className="h-4 w-4" aria-hidden />
            신청서 관리
          </Link>
        </div>

        <div className="mb-8">
          <SignatureManager departments={signatureDepartments} />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">
            결재 대기 신청서
          </h2>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
            {rows.length}건
          </span>
        </div>

        {rows.length === 0 ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h2 className="mt-3 text-lg font-bold text-stone-900">
              지금 사인할 신청서가 없습니다.
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              새 결재 차례가 오면 이 화면에 표시됩니다.
            </p>
          </section>
        ) : (
          <ul className="grid gap-3">
            {rows.map((row) => {
              const step = currentStep(row);
              const detailHref =
                !fullAdmin && row.kind === "reservation"
                  ? `/admin/reservations/${row.id}`
                  : !fullAdmin
                    ? `/series/${row.id}`
                    : `/sign/${row.qr_token}`;
              return (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-brand-700">
                          #{row.ref_no ?? row.id.slice(0, 8)}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                          {row.kind === "series" ? "정기" : "일회성"}
                        </span>
                        {step && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {ROLE_LABEL[step.role]} 차례
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 truncate text-lg font-bold text-stone-900">
                        {row.purpose}
                      </h2>
                      <p className="mt-1 text-sm text-stone-600">
                        {row.dept?.name ?? "-"} · {row.applicant.name} ·{" "}
                        {row.room.floor.building.name} {row.room.floor.label}{" "}
                        {row.room.name}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {rowTimeLabel(row)}
                      </p>
                    </div>
                    <Link
                      href={detailHref}
                      className="inline-flex min-h-12 flex-none items-center justify-center rounded-lg bg-brand-600 px-5 py-3 font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                    >
                      {fullAdmin ? "사인하기" : "신청서 보기"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
