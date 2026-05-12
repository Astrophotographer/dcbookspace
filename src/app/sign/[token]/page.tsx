import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { ApprovalProgress } from "@/components/approval-progress";
import { ConflictBanner } from "@/components/conflict-banner";
import { formatDateTime } from "@/lib/utils";
import { getSignTargetByQrToken } from "@/lib/repo";
import { findActiveConflictsFor } from "@/lib/conflicts";
import { createServiceClient } from "@/lib/supabase/server";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/reservation-status";
import { weekdayLabel } from "@/lib/recurrence";
import { readApproverSession } from "@/lib/approver-session";
import { SignByPinForm, ChairmanCancelForm } from "./sign-form";

export const dynamic = "force-dynamic";

export default async function SignPage(props: PageProps<"/sign/[token]">) {
  if (!isSupabaseConfigured()) return <SetupNeeded />;

  const { token } = await props.params;
  const target = await getSignTargetByQrToken(token);
  if (!target) notFound();

  if (target.kind === "series") {
    return <SeriesSign series={target.series} token={token} />;
  }
  return <ReservationSign reservation={target.reservation} token={token} />;
}

type SignTargetData = NonNullable<
  Awaited<ReturnType<typeof getSignTargetByQrToken>>
>;
type ReservationData = Extract<SignTargetData, { kind: "reservation" }>["reservation"];
type SeriesData = Extract<SignTargetData, { kind: "series" }>["series"];

async function ReservationSign({
  reservation: r,
  token,
}: {
  reservation: ReservationData;
  token: string;
}) {
  const ds = displayStatus(r);
  // 결재 진행 중일 때만 충돌 안내 — 이미 결정된 신청은 정보 의미 없음
  const conflicts =
    r.status === "pending"
      ? await findActiveConflictsFor(createServiceClient(), {
          kind: "reservation",
          id: r.id,
        })
      : [];
  const conflictLevel = conflicts.some((c) => c.status === "approved")
    ? "critical"
    : "warn";
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-brand-700">장소사용 결재</h1>
        <p className="mt-1 text-sm text-stone-500">신청번호 {r.ref_no}</p>
      </header>

      <section className="mb-5 rounded-2xl border-2 border-stone-300 bg-white p-5 text-base">
        <p className="mb-2">
          <strong>{r.dept?.name ?? "-"}</strong> 부서가
        </p>
        <p className="mb-2 text-lg font-semibold">
          {r.room.floor.building.name} {r.room.floor.label} {r.room.name}
        </p>
        <p className="mb-2 text-stone-700">
          <strong>{formatDateTime(r.start_at)}</strong> 부터
          <br />
          <strong>{formatDateTime(r.end_at)}</strong> 까지
        </p>
        <p className="mb-3 rounded bg-amber-50 p-2">
          <strong>목적:</strong> {r.purpose}
        </p>
        <p className="text-sm text-stone-600">
          신청자 {r.applicant.name} ({r.applicant.phone}) · 인원{" "}
          {r.attendee_count}명
          {r.is_external && " · 외부행사"}
        </p>
        <div className="mt-3 flex justify-end">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${STATUS_BADGE_CLASS[ds]}`}
          >
            {STATUS_LABEL[ds]}
          </span>
        </div>
      </section>

      <ConflictBanner conflicts={conflicts} level={conflictLevel} />

      {r.status === "pending" && (
        <SignByPinForm
          token={token}
          hasAutoSession={!!(await readApproverSession())}
        />
      )}
      {r.status === "approved" && (
        <ApprovedAndCancel token={token} label="신청" />
      )}
      {r.status === "rejected" && (
        <DoneBox label="이 신청은 반려되었습니다" color="red" />
      )}
      {r.status === "cancelled" && (
        <DoneBox label="이 신청은 취소되었습니다" color="amber" />
      )}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-stone-800">
          결재 진행 상황
        </h2>
        <ApprovalProgress
          route={r.route}
          approvals={r.approvals}
          currentStep={r.current_step}
        />
      </section>
    </main>
  );
}

async function SeriesSign({
  series: s,
  token,
}: {
  series: SeriesData;
  token: string;
}) {
  const ds = displayStatus({
    status: s.status,
    approvals: s.approvals,
  });
  const totalRows = s.reservations.length;
  const occurrenceCount = totalRows / Math.max(1, s.time_blocks.length);
  const blockLabel = s.time_blocks.map((b) => `${b.start}–${b.end}`).join(", ");
  const occurrences = [...s.reservations].sort((a, b) =>
    a.start_at.localeCompare(b.start_at),
  );
  const conflicts =
    s.status === "pending"
      ? await findActiveConflictsFor(createServiceClient(), {
          kind: "series",
          id: s.id,
        })
      : [];
  const conflictLevel = conflicts.some((c) => c.status === "approved")
    ? "critical"
    : "warn";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-brand-700">
          정기 장소사용 결재
        </h1>
        <p className="mt-1 text-sm text-stone-500">신청번호 {s.ref_no}</p>
      </header>

      <section className="mb-5 rounded-2xl border-2 border-stone-300 bg-white p-5 text-base">
        <p className="mb-2">
          <strong>{s.dept?.name ?? "-"}</strong> 부서가
        </p>
        <p className="mb-2 text-lg font-semibold">
          {s.room.floor.building.name} {s.room.floor.label} {s.room.name}
        </p>
        <p className="mb-2 text-stone-700">
          매주 <strong>{weekdayLabel(s.weekday)}요일</strong> · {blockLabel}
        </p>
        <p className="mb-2 text-stone-700">
          {s.start_date} ~ {s.end_date}{" "}
          <span className="text-sm text-stone-500">
            (총 {occurrenceCount}회 × {s.time_blocks.length}시간대 ={" "}
            {totalRows}개 예약)
          </span>
        </p>
        <p className="mb-3 rounded bg-amber-50 p-2">
          <strong>목적:</strong> {s.purpose}
        </p>
        <p className="text-sm text-stone-600">
          신청자 {s.applicant.name} ({s.applicant.phone}) · 인원{" "}
          {s.attendee_count}명
          {s.is_external && " · 외부행사"}
        </p>
        <div className="mt-3 flex justify-end">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${STATUS_BADGE_CLASS[ds]}`}
          >
            {STATUS_LABEL[ds]}
          </span>
        </div>
      </section>

      <ConflictBanner conflicts={conflicts} level={conflictLevel} />

      {s.status === "pending" && (
        <SignByPinForm
          token={token}
          hasAutoSession={!!(await readApproverSession())}
        />
      )}
      {s.status === "approved" && (
        <ApprovedAndCancel token={token} label="시리즈" />
      )}
      {s.status === "rejected" && (
        <DoneBox label="이 정기 신청은 반려되었습니다" color="red" />
      )}
      {s.status === "cancelled" && (
        <DoneBox label="이 정기 신청은 취소되었습니다" color="amber" />
      )}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-stone-800">
          결재 진행 상황 (1회 결재로 모든 회차 자동 확정)
        </h2>
        <ApprovalProgress
          route={s.route}
          approvals={s.approvals}
          currentStep={s.current_step}
        />
      </section>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-stone-700">
            회차 일정 ({occurrences.length}건)
          </summary>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-stone-600 sm:grid-cols-3">
            {occurrences.map((r) => (
              <li key={r.id} className="font-mono">
                {format(parseISO(r.start_at), "M/d (E) HH:mm", { locale: ko })}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}

function ApprovedAndCancel({ token, label }: { token: string; label: string }) {
  return (
    <div className="space-y-4">
      <DoneBox
        label={`✅ 모든 결재가 완료된 ${label}입니다`}
        color="emerald"
      />
      <ChairmanCancelForm token={token} />
    </div>
  );
}

function DoneBox({
  label,
  color,
}: {
  label: string;
  color: "emerald" | "red" | "amber";
}) {
  const cls =
    color === "emerald"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : color === "red"
        ? "bg-red-50 border-red-300 text-red-900"
        : "bg-amber-50 border-amber-300 text-amber-900";
  return (
    <div className={`rounded-2xl border-2 p-6 text-center text-lg ${cls}`}>
      {label}
    </div>
  );
}
