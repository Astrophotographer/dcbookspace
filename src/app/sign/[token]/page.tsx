import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { ApprovalProgress } from "@/components/approval-progress";
import { formatDateTime } from "@/lib/utils";
import { getReservationByQrToken } from "@/lib/repo";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/reservation-status";
import { readApproverSession } from "@/lib/approver-session";
import { SignByPinForm, ChairmanCancelForm } from "./sign-form";

export default async function SignPage(props: PageProps<"/sign/[token]">) {
  if (!isSupabaseConfigured()) return <SetupNeeded />;

  const { token } = await props.params;
  const r = await getReservationByQrToken(token);
  if (!r) notFound();

  const ds = displayStatus(r);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-brand-700">장소사용 결재</h1>
        <p className="mt-1 text-sm text-stone-500">신청번호 {r.ref_no}</p>
      </header>

      {/* 신청 정보 */}
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

      {/* 상태별 액션 영역 */}
      {r.status === "pending" && (
        <SignByPinForm
          token={token}
          hasAutoSession={!!(await readApproverSession())}
        />
      )}

      {r.status === "approved" && (
        <ApprovedAndCancel token={token} />
      )}

      {r.status === "rejected" && (
        <DoneBox label="이 신청은 반려되었습니다" color="red" />
      )}

      {r.status === "cancelled" && (
        <DoneBox label="이 신청은 취소되었습니다" color="amber" />
      )}

      {/* 진행 상황 (가장 하단) */}
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

function ApprovedAndCancel({ token }: { token: string }) {
  return (
    <div className="space-y-4">
      <DoneBox label="✅ 모든 결재가 완료된 신청입니다" color="emerald" />
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
