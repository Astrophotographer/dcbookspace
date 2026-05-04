import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-brand-700">장소사용</span>
          <span className="hidden text-sm text-stone-500 sm:inline">
            교회 장소 신청·결재
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
            내 신청
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
