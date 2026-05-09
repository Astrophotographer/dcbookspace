import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { qrDataUrl } from "@/lib/qr";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// QR 은 외부망 휴대폰이 스캔하므로 반드시 공개 도메인을 가리켜야 한다.
// localhost / LAN IP 에 fallback 하면 외부에선 못 열리므로 prod URL 을 hard
// fallback. NEXT_PUBLIC_APP_URL 이 명시돼 있으면 그 값을 우선 사용.
const PROD_APP_URL = "https://dcbookspace.vercel.app";

/**
 * 외부에 게시할 "장소사용 신청 QR" 페이지.
 * 게시판·복도 등에 붙여 두면 휴대폰으로 스캔 → /apply 로 직행.
 *
 * 인쇄(Ctrl/Cmd+P) 시 헤더·푸터·버튼은 모두 숨겨 깔끔하게 출력되게 print:hidden
 * 으로 가렸다.
 */
export default async function ApplyQrPage() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  const isLocal = (s?: string | null) =>
    !!s && /(^|\/\/)(localhost|127\.0\.0\.1)/.test(s);
  const baseUrl = envUrl && !isLocal(envUrl) ? envUrl : PROD_APP_URL;
  // 키오스크 모드 — 게시판/복도에서 스캔한 사용자가 키오스크 UX 로 진입 (자동 reset 등)
  const applyUrl = `${baseUrl}/apply?kiosk=1`;
  const qr = await qrDataUrl(applyUrl, 480);

  return (
    <>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 print:py-0">
        <div className="mb-4 text-sm text-stone-500 print:hidden">
          <Link href="/admin" className="hover:underline">
            ← 관리
          </Link>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">
              장소사용 신청
            </h1>
            <p className="mt-2 text-lg text-stone-600">
              아래 QR을 휴대폰으로 스캔하면 신청서가 바로 열립니다
            </p>
          </div>

          <div className="my-8 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image 최적화 의미 없음 */}
            <img
              src={qr}
              alt={`${applyUrl} QR 코드`}
              width={420}
              height={420}
              className="h-auto w-full max-w-[420px]"
            />
          </div>

          <div className="text-center">
            <div className="text-sm text-stone-500">또는 직접 접속:</div>
            <div className="mt-1 break-all font-mono text-base text-stone-800">
              {applyUrl}
            </div>
          </div>
        </div>

        {/* 인쇄·도움말은 화면 전용 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="text-sm text-stone-500">외부 게시용 QR 코드</p>
          <PrintButton />
        </div>
      </main>
    </>
  );
}
