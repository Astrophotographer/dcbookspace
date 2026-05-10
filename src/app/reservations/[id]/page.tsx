import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ApprovalProgress } from "@/components/approval-progress";
import { ReservationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { formatDateTime } from "@/lib/utils";
import { isAdmin } from "@/lib/admin-server";
import { maskName, maskPhone } from "@/lib/privacy";
import type { ReservationDetail } from "@/lib/repo";
import { Printer, FileText } from "lucide-react";
import { OwnerActions } from "./owner-actions";
import { PrintProgress } from "@/components/print-progress";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { KioskAutoReturn } from "@/components/kiosk-auto-return";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

export default async function Page(props: PageProps<"/reservations/[id]">) {
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
  // 관리자가 아니면 신청자 이름·전화 마스킹 (홍**, 010-1234-****)
  const viewerIsAdmin = await isAdmin();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*),
       route:approval_routes (*)`,
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const r = data as unknown as ReservationDetail;

  return (
    <>
      <SiteHeader kiosk={isKiosk} />
      {/* 결재 진행·인쇄 상태 변화 시 자동 갱신 — 자기 신청서 행만 필터링해서
          다른 신청서 변경에 대한 불필요한 broadcast/refresh 차단 */}
      <RealtimeRefresh
        tables={[
          { table: "reservations", filter: `id=eq.${id}` },
          { table: "approvals", filter: `reservation_id=eq.${id}` },
        ]}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {justSubmitted && (
          <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
            <strong>신청서가 잘 접수되었습니다.</strong> 사무실 프린터로
            결재 서류 인쇄 요청이 전송됐습니다. 아래에서 진행 상황을 확인해
            주세요.
          </div>
        )}

        {isKiosk && <KioskAutoReturn printStatus={r.print_status} />}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">
            신청서 #{r.ref_no}
          </h1>
          <ReservationBadge reservation={r} />
        </div>

        <OwnerActions
          reservationId={r.id}
          refNo={r.ref_no}
          purpose={r.purpose}
          applicantName={r.applicant.name}
          applicantPhone={r.applicant.phone ?? ""}
          editable={r.status === "pending" && r.current_step === 1}
        />

        {/* PWA 푸시 알림 — 키오스크 모드(공용 단말)에서는 숨김 */}
        {!isKiosk && r.applicant.phone && (
          <div className="mb-4">
            <PushPermissionPrompt applicantPhone={r.applicant.phone} />
          </div>
        )}

        <div className="mb-6">
          <PrintProgress
            kind="reservation"
            id={r.id}
            status={r.print_status}
            statusAt={r.print_status_at}
          />
        </div>

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row k="신청자">
              {viewerIsAdmin
                ? `${r.applicant.name} (${r.applicant.phone})`
                : `${maskName(r.applicant.name)} (${maskPhone(r.applicant.phone ?? "")})`}
            </Row>
            <Row k="부서">{r.dept?.name ?? "-"}</Row>
            <Row k="장소">
              {r.room.floor.building.name} {r.room.floor.label} {r.room.name}
            </Row>
            <Row k="참석 인원">{r.attendee_count}명</Row>
            <Row k="시작">{formatDateTime(r.start_at)}</Row>
            <Row k="종료">{formatDateTime(r.end_at)}</Row>
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

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행</h2>
          <ApprovalProgress
            route={r.route}
            approvals={r.approvals}
            currentStep={r.current_step}
          />
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행 방법</h2>
          <p className="mb-4 text-stone-700">
            결재 서류를 인쇄하여 결재자에게 회람하거나, 디지털 링크를 직접
            전달하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/reservations/${r.id}/print`} target="_blank">
              <Button size="lg" variant="primary">
                <Printer className="h-5 w-5" />
                결재 서류 인쇄
              </Button>
            </Link>
            <Link href={`/reservations/${r.id}/digital`}>
              <Button size="lg" variant="secondary">
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
