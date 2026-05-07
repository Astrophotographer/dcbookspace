import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:h-20 sm:gap-4 sm:px-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 sm:gap-4"
          aria-label="등촌교회 홈"
        >
          <Image
            src="/deungchon-logo.png"
            alt="등촌교회"
            width={120}
            height={56}
            priority
            className="h-10 w-auto object-contain sm:h-14"
          />
        </Link>
        <nav className="flex flex-none items-center gap-1 text-sm sm:gap-1.5 sm:text-base">
          <Link
            href="/"
            className="rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
          >
            <span className="sm:hidden">현황판</span>
            <span className="hidden sm:inline">현황판보기</span>
          </Link>
          <Link
            href="/reservations"
            className="rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
          >
            <span className="sm:hidden">신청내역</span>
            <span className="hidden sm:inline">모든 신청내역</span>
          </Link>
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
          >
            관리
          </Link>
          {/* 장소신청 — primary CTA. brand color, 약간 더 두꺼운 글씨로 한눈에 띄게. */}
          <Link
            href="/apply"
            className="rounded-lg bg-brand-600 px-3 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
          >
            장소신청
          </Link>
        </nav>
      </div>
    </header>
  );
}
