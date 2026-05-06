import Link from "next/link";
import { Home } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
          >
            <Home className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-brand-700">메인으로</span>
            <span className="hidden text-sm text-stone-500 sm:inline">
              · 장소사용 · 교회 장소 신청·결재
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/apply"
            className="rounded-lg px-3 py-2 hover:bg-stone-100"
          >
            신청하기
          </Link>
          <Link
            href="/reservations"
            className="rounded-lg px-3 py-2 hover:bg-stone-100"
          >
            모든 신청내역
          </Link>
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2 hover:bg-stone-100"
          >
            관리
          </Link>
        </nav>
      </div>
    </header>
  );
}
