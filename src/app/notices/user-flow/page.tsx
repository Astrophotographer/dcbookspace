import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "사용방법",
};

export default function UserFlowNoticePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">사용방법</h1>
            <p className="mt-1 text-sm text-stone-600">
              장소사용 신청 시스템의 전체 사용 흐름입니다.
            </p>
          </div>
          <Link
            href="/notices"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            공지사항으로
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <iframe
            title="장소사용 신청 사용방법"
            src="/notices/user-flow/source"
            className="h-[72vh] min-h-[520px] w-full bg-white"
          />
        </section>
      </main>
    </>
  );
}
