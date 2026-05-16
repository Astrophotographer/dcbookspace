import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { ApprovalProgress } from "@/components/approval-progress";
import { ReservationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import {
  formatDateTime,
  formatDuration,
  formatTime,
  resolveBaseUrl,
} from "@/lib/utils";
import { qrDataUrl } from "@/lib/qr";
import { isAdmin } from "@/lib/admin-server";
import { maskName, maskPhone } from "@/lib/privacy";
import type { ReservationDetail } from "@/lib/repo";
import { Printer, FileText } from "lucide-react";
import { OwnerActions } from "./owner-actions";
import { PrintProgress } from "@/components/print-progress";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { KioskAutoReturn } from "@/components/kiosk-auto-return";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";
import { BackLink } from "@/components/back-link";
import { getPrintEnabled } from "@/lib/site-settings";

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
  const printEnabled = await getPrintEnabled();

  // QR 코드는 관리자에게만 노출 — 일반 신청자 화면엔 의미 없고, 외부 노출 위험 있음
  let qr: string | null = null;
  let qrUrl: string | null = null;
  if (viewerIsAdmin) {
    const h = await headers();
    const baseUrl = resolveBaseUrl({
      envUrl: process.env.NEXT_PUBLIC_APP_URL,
      host: h.get("host"),
      proto: h.get("x-forwarded-proto"),
    });
    qrUrl = `${baseUrl}/sign/${r.qr_token}`;
    qr = await qrDataUrl(qrUrl, 220);
  }

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
        {/* 키오스크 모드에선 뒤로가기 숨김 — 어르신용 태블릿에서 의도치 않은 흐름 방지 */}
        {!isKiosk && (
          <div className="mb-3">
            <BackLink />
          </div>
        )}
        {justSubmitted && (
          printEnabled ? (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
              <strong>신청서를 프린트하는 중입니다.</strong> 아래에서 진행
              상황을 확인해 주세요.
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
              <strong>신청서가 잘 접수되었습니다.</strong> 결재가 진행되면 아래
              결재 진행 카드에서 상태를 확인할 수 있습니다.
            </div>
          )
        )}

        {justSubmitted && !isKiosk && r.applicant.phone && (
          <div className="mb-4">
            <PushPermissionPrompt applicantPhone={r.applicant.phone} />
          </div>
        )}

        {/* 신청 완료 직후 텔레그램 알림 등록 안내 — 키오스크(공용 단말) 모드는
            제외해서 공용 폰으로 등록되는 사고 방지. 이름·휴대폰 prefill 로
            한 화면에서 바로 등록 가능. */}
        {justSubmitted && !isKiosk && (
          <Link
            href={`/me/telegram?name=${encodeURIComponent(r.applicant.name)}&phone=${encodeURIComponent(r.applicant.phone ?? "")}`}
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sky-900 hover:bg-sky-100"
          >
            <div>
              <div className="font-semibold">📱 진행 상황을 텔레그램으로 받기</div>
              <div className="mt-0.5 text-sm text-sky-800">
                결재가 끝났는지·반려됐는지 텔레그램으로 바로 알림 받기.
              </div>
            </div>
            <span className="flex-none text-sm font-semibold">등록하기 →</span>
          </Link>
        )}

        {/* 키오스크 자동 복귀 — 프린트 OFF/완료는 10초 후 신청 폼으로, 문제 시 버튼만 유지. */}
        {isKiosk && (
          <KioskAutoReturn
            printStatus={r.print_status}
            printEnabled={printEnabled}
          />
        )}

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
        {!justSubmitted && !isKiosk && r.applicant.phone && (
          <div className="mb-4">
            <PushPermissionPrompt applicantPhone={r.applicant.phone} />
          </div>
        )}

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

        {/* 관리자 = QR + 신청 정보 2-col, 일반 신청자 = 신청 정보만 */}
        <section
          className={
            viewerIsAdmin
              ? "mb-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-[220px_1fr]"
              : "mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
          }
        >
          {viewerIsAdmin && qr && (
            <div className="flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR은 base64 data URL. next/image 최적화 의미 없음 */}
              <img src={qr} alt="결재 QR" width={200} height={200} />
              <p className="mt-2 text-xs text-stone-500">QR 스캔 → PIN 결재</p>
              <p className="mt-1 break-all text-[10px] text-stone-400">
                {qrUrl}
              </p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
            {printEnabled
              ? "결재 서류를 인쇄하여 결재자에게 회람하거나, 디지털 링크를 직접 전달하세요."
              : "결재자에게 아래 디지털 링크를 전달하세요."}
          </p>
          {/* 모바일에서도 한 줄 — admin/reservations/[id] 와 동일 패턴 */}
          <div className="flex gap-2">
            {printEnabled && (
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
            )}
            <Link
              href={`/reservations/${r.id}/digital`}
              className="flex-1 sm:flex-none"
            >
              <Button
                size="lg"
                variant={printEnabled ? "secondary" : "primary"}
                className="w-full whitespace-nowrap"
              >
                <FileText className="h-5 w-5" />
                링크 보기
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
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs font-medium text-stone-500">{k}</dt>
      <dd className="mt-0.5 text-base text-stone-900">{children}</dd>
    </div>
  );
}
