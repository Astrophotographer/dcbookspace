import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { qrDataUrl } from "@/lib/qr";
import { resolveBaseUrl } from "@/lib/utils";
import type { ReservationDetail } from "@/lib/repo";
import { ApprovalProgress } from "@/components/approval-progress";
import { CopyButton } from "./copy-button";

export default async function Page(
  props: PageProps<"/reservations/[id]/digital">,
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

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  const url = `${baseUrl}/sign/${r.qr_token}`;
  const qr = await qrDataUrl(url, 220);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold">디지털 결재 링크</h1>
        <p className="mb-6 text-stone-600">
          QR 또는 링크를 결재자(차장 · 관리장로 · 당회장)에게 공유하세요.
          본인 PIN을 입력하면 자동으로 본인 단계가 진행됩니다.
        </p>

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR은 base64 data URL. next/image 최적화 의미 없음 */}
            <img src={qr} alt="결재 QR" width={180} height={180} />
            <div className="flex-1 break-all">
              <p className="mb-1 text-sm text-stone-500">결재 링크</p>
              <code className="block rounded bg-stone-100 p-2 text-sm">
                {url}
              </code>
              <CopyButton text={url} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">결재 진행 상황</h2>
          <ApprovalProgress
            route={r.route}
            approvals={r.approvals}
            currentStep={r.current_step}
          />
        </section>
      </main>
    </>
  );
}
