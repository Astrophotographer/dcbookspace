import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { RESERVATION_FULL_SELECT } from "@/lib/supabase/selects";
import { qrDataUrl } from "@/lib/qr";
import { ApprovalProgress } from "@/components/approval-progress";
import { ReservationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatDuration,
  formatTime,
  resolveBaseUrl,
} from "@/lib/utils";
import { Plus, Printer } from "lucide-react";
import type { ReservationDetail } from "@/lib/repo";
import { AdminActions } from "./admin-actions";
import { getPrintEnabled } from "@/lib/site-settings";
import { PrintProgress } from "@/components/print-progress";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export default async function AdminReservationDetail(
  props: PageProps<"/admin/reservations/[id]">,
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
    .select(RESERVATION_FULL_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const r = data as unknown as ReservationDetail;

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  const qrUrl = `${baseUrl}/sign/${r.qr_token}`;
  const qr = await qrDataUrl(qrUrl, 220);
  const printEnabled = await getPrintEnabled();

  return (
    <>
      <SiteHeader />
      {/* 결재·인쇄 상태 실시간 갱신 — /reservations/[id] 와 동일 패턴 */}
      <RealtimeRefresh
        tables={[
          { table: "reservations", filter: `id=eq.${id}` },
          { table: "approvals", filter: `reservation_id=eq.${id}` },
        ]}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <Link
            href="/admin/reservations"
            className="text-stone-500 hover:underline"
          >
            ← 신청서 관리
          </Link>
          <Link
            href="/admin/reservations/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            새 신청서 직접 등록
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              신청서 #{r.ref_no ?? r.id.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              작성: {formatDateTime(r.created_at)}
            </p>
          </div>
          <ReservationBadge reservation={r} />
        </div>

        {/* QR + 신청 정보 — QR 박스는 데스크탑에서만 노출, 모바일은 정보만 */}
        <section className="mb-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-[220px_1fr]">
          <div className="hidden flex-col items-center text-center sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR은 base64 data URL. next/image 최적화 의미 없음 */}
            <img src={qr} alt="결재 QR" width={200} height={200} />
            <p className="mt-2 text-xs text-stone-500">QR 스캔 → PIN 결재</p>
            <p className="mt-1 break-all text-[10px] text-stone-400">
              {qrUrl}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row k="신청자">
              {r.applicant.name} ({r.applicant.phone})
            </Row>
            <Row k="부서">{r.dept?.name ?? "-"}</Row>
            <Row k="장소">
              {r.room.floor.building.name} {r.room.floor.label} {r.room.name}
            </Row>
            <Row k="참석 인원">{r.attendee_count}명</Row>
            <Row k="시작과 종료" full>
              {formatDateTime(r.start_at)} ~{" "}
              {r.start_at.slice(0, 10) === r.end_at.slice(0, 10) ? (
                <>
                  {formatTime(r.end_at)}{" "}
                  <span className="text-sm text-stone-500">
                    ({formatDuration(r.start_at, r.end_at)})
                  </span>
                </>
              ) : (
                formatDateTime(r.end_at)
              )}
            </Row>
            <Row k="외부 행사">{r.is_external ? "예" : "아니오"}</Row>
            <Row k="결재선">{r.route.name}</Row>
            <Row k="목적" full>
              {r.purpose}
            </Row>
            {r.notes && (
              <Row k="비고" full>
                {r.notes}
              </Row>
            )}
          </dl>
        </section>

        {/* 프린트 진행 상황 — /reservations/[id] 와 동일하게 인쇄 ON 일 때만 노출 */}
        {printEnabled && (
          <div className="mb-6">
            <PrintProgress
              kind="reservation"
              id={r.id}
              status={r.print_status}
              statusAt={r.print_status_at}
            />
          </div>
        )}

        {/* 관리자 작업 — 결재 진행 위에 노출해서 강제 처리 액션을 가장 먼저 눈에 띄게 */}
        <section className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
          <h2 className="mb-1 text-lg font-semibold text-amber-900">
            관리자 작업
          </h2>
          <p className="mb-4 text-sm text-amber-800">
            결재 없이 즉시 예약 확정·반려 처리하거나, 신청서 자체를 삭제할 수
            있습니다.
          </p>
          <AdminActions
            reservationId={r.id}
            canForceApprove={r.status === "pending"}
            canForceReject={r.status === "pending" || r.status === "approved"}
            canRevive={r.status === "rejected"}
            isPostApproval={r.status === "approved"}
          />
        </section>

        {/* 결재 진행 상황 */}
        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행 상황</h2>
          <ApprovalProgress
            route={r.route}
            approvals={r.approvals}
            currentStep={r.current_step}
          />
        </section>

        {/* 출력 / 다운로드 — 프린트 기능 OFF 면 섹션 자체 미렌더 */}
        {printEnabled && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">서류 출력</h2>
            <p className="mb-3 text-sm text-stone-600">
              결재 서류를 다시 출력하거나 PDF로 저장할 수 있습니다. 신청 확정 ·
              취소는 위 QR을 스캔해 진행하세요.
            </p>
            {/* 모바일에서도 한 줄 — 각 Link 가 flex-1, Button w-full */}
            <div className="flex gap-2">
              <Link
                href={`/reservations/${r.id}/print`}
                target="_blank"
                className="flex-1 sm:flex-none"
              >
                <Button
                  size="lg"
                  variant="primary"
                  className="w-full whitespace-nowrap"
                >
                  <Printer className="h-5 w-5" />
                  결재서류
                </Button>
              </Link>
              <Link
                href={`/reservations/${r.id}/digital`}
                className="flex-1 sm:flex-none"
              >
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full whitespace-nowrap"
                >
                  링크 보기
                </Button>
              </Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function Row({
  k,
  children,
  full,
}: {
  k: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs font-medium text-stone-500">{k}</dt>
      <dd className="mt-0.5 text-base text-stone-900">{children}</dd>
    </div>
  );
}
