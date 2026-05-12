import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { getPrintEnabled } from "@/lib/site-settings";
import { PrintToggle } from "./print-toggle";

export default async function AdminSettingsPage() {
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

  const printEnabled = await getPrintEnabled();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-3 text-sm text-stone-500">
          <Link href="/admin" className="hover:underline">
            ← 관리
          </Link>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">사이트 설정</h1>
        <p className="mb-6 text-sm text-stone-600">
          사이트 전체에 영향을 주는 토글들. 변경 즉시 모든 사용자 화면에
          반영됩니다.
        </p>
        <PrintToggle initialEnabled={printEnabled} />
      </main>
    </>
  );
}
