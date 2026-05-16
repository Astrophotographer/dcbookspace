import Link from "next/link";
import { notFound } from "next/navigation";
import { parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Printer, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ApprovalProgress } from "@/components/approval-progress";
import { ReservationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { getSeries } from "@/lib/repo";
import { formatKst as format } from "@/lib/utils";
import { weekdayLabel } from "@/lib/recurrence";
import { OwnerActions } from "./owner-actions";
import { PrintProgress } from "@/components/print-progress";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { KioskAutoReturn } from "@/components/kiosk-auto-return";
import { getPrintEnabled } from "@/lib/site-settings";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

export const dynamic = "force-dynamic";

function timeBlocksLabel(blocks: { start: string; end: string }[]): string {
  return blocks.map((b) => `${b.start}–${b.end}`).join(", ");
}

type PageArgs = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just?: string; kiosk?: string }>;
};

export default async function SeriesPage(props: PageArgs) {
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
  const sp = await props.searchParams;
  const justSubmitted = sp.just === "1";
  const isKiosk = sp.kiosk === "1";

  const series = await getSeries(id);
  if (!series) notFound();

  const totalRows = series.reservations.length;
  const occurrenceCount = totalRows / Math.max(1, series.time_blocks.length);
  const printEnabled = await getPrintEnabled();

  return (
    <>
      <SiteHeader kiosk={isKiosk} />
      {/* 결재 진행 시 화면 자동 갱신 — 자기 시리즈 행만 필터.
          자식 reservations 변경(인쇄 상태 등) 은 series_id 컬럼으로 묶어서 같은 트리거. */}
      <RealtimeRefresh
        tables={[
          { table: "reservation_series", filter: `id=eq.${id}` },
          { table: "reservations", filter: `series_id=eq.${id}` },
          { table: "approvals", filter: `series_id=eq.${id}` },
        ]}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {justSubmitted && (
          printEnabled ? (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
              <strong>정기 신청서를 프린트하는 중입니다.</strong> 결재 1회로 모든
              회차가 함께 확정됩니다. 아래에서 진행 상황을 확인해 주세요.
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
              <strong>정기 신청이 잘 접수되었습니다.</strong> 결재 1회로 모든
              회차가 함께 확정됩니다.
            </div>
          )
        )}

        {justSubmitted && !isKiosk && series.applicant.phone && (
          <div className="mb-4">
            <PushPermissionPrompt applicantPhone={series.applicant.phone} />
          </div>
        )}

        {isKiosk && (
          <KioskAutoReturn
            printStatus={series.print_status}
            printEnabled={printEnabled}
          />
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">
            정기 신청 #{series.ref_no}
          </h1>
          <ReservationBadge
            reservation={{
              status: series.status,
              approvals: series.approvals,
            }}
          />
        </div>

        <OwnerActions
          seriesId={series.id}
          refNo={series.ref_no}
          purpose={series.purpose}
          applicantName={series.applicant.name}
          applicantPhone={series.applicant.phone ?? ""}
          editable={series.status === "pending" && series.current_step === 1}
          totalRows={totalRows}
        />

        {!justSubmitted && !isKiosk && series.applicant.phone && (
          <div className="mb-4">
            <PushPermissionPrompt applicantPhone={series.applicant.phone} />
          </div>
        )}

        {printEnabled && (
          <div className="mb-6">
            <PrintProgress
              kind="series"
              id={series.id}
              status={series.print_status}
              statusAt={series.print_status_at}
            />
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row k="신청자">
              {series.applicant.name} ({series.applicant.phone})
            </Row>
            <Row k="부서">{series.dept?.name ?? "-"}</Row>
            <Row k="장소">
              {series.room.floor.building.name} {series.room.floor.label}{" "}
              {series.room.name}
            </Row>
            <Row k="참석 인원">{series.attendee_count}명</Row>
            <Row k="반복">매주 {weekdayLabel(series.weekday)}요일</Row>
            <Row k="시간대">{timeBlocksLabel(series.time_blocks)}</Row>
            <Row k="기간">
              {series.start_date} ~ {series.end_date}
            </Row>
            <Row k="총 회차">
              {occurrenceCount}회 × {series.time_blocks.length}시간대 ={" "}
              {totalRows}개 예약
            </Row>
            <Row k="외부 행사">{series.is_external ? "예" : "아니오"}</Row>
            <Row k="결재선">{series.route.name}</Row>
            <Row k="목적" full>
              {series.purpose}
            </Row>
            {series.notes && (
              <Row k="비고" full>
                {series.notes}
              </Row>
            )}
          </dl>
        </section>

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <details>
            <summary className="cursor-pointer text-base font-semibold text-stone-800">
              회차 일정 보기 ({series.reservations.length}건)
            </summary>
            <ul className="mt-3 grid gap-1.5 text-sm text-stone-700 sm:grid-cols-2">
              {[...series.reservations]
                .sort((a, b) => a.start_at.localeCompare(b.start_at))
                .map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded border border-stone-200 px-2 py-1"
                  >
                    <span className="font-mono text-xs text-stone-500">
                      {format(parseISO(r.start_at), "M/d (E)", { locale: ko })}
                    </span>
                    <span className="font-mono">
                      {format(parseISO(r.start_at), "HH:mm")}–
                      {format(parseISO(r.end_at), "HH:mm")}
                    </span>
                  </li>
                ))}
            </ul>
          </details>
        </section>

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행</h2>
          <ApprovalProgress
            route={series.route}
            approvals={series.approvals}
            currentStep={series.current_step}
          />
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행 방법</h2>
          <p className="mb-4 text-stone-700">
            결재 1회로 모든 회차가 함께 확정됩니다.{" "}
            {printEnabled
              ? "인쇄해서 회람하시거나 디지털 링크로 전달하세요."
              : "결재자에게 아래 디지털 링크를 전달하세요."}
          </p>
          <div className="flex flex-wrap gap-2">
            {printEnabled && (
              <Link href={`/series/${series.id}/print`} target="_blank">
                <Button size="lg" variant="primary">
                  <Printer className="h-5 w-5" />
                  결재 서류 인쇄
                </Button>
              </Link>
            )}
            <Link href={`/sign/${series.qr_token}`}>
              <Button size="lg" variant={printEnabled ? "secondary" : "primary"}>
                <FileText className="h-5 w-5" />
                디지털 링크 보기
              </Button>
            </Link>
          </div>
        </section>
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
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-sm font-medium text-stone-500">{k}</dt>
      <dd className="mt-0.5 text-base text-stone-900">{children}</dd>
    </div>
  );
}
