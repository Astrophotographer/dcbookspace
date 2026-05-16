import Image from "next/image";
import Link from "next/link";
import { Tablet } from "lucide-react";
import { isAdmin } from "@/lib/admin-server";
import { SiteNav } from "./site-nav";

type Props = {
  /** 키오스크 모드 — 사무실 태블릿 신청 전용. 네비 GUI 다 숨김 */
  kiosk?: boolean;
};

export async function SiteHeader({ kiosk = false }: Props = {}) {
  // 키오스크 모드: 로고 + "신청 전용" 배지만. 다른 페이지로 갈 수 있는 GUI 0
  // — 어르신이 의도 외 영역으로 빠지는 사고 방지. Link 도 일반 div 로 (홈 이동 X).
  if (kiosk) {
    return (
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:h-20 sm:gap-4 sm:px-4">
          <div
            className="flex min-w-0 items-center gap-2 sm:gap-4"
            aria-label="등촌교회"
          >
            <Image
              src="/deungchon-logo.png"
              alt="등촌교회"
              width={120}
              height={56}
              priority
              className="h-10 w-auto object-contain sm:h-14"
            />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 sm:text-sm">
            <Tablet className="h-3.5 w-3.5" aria-hidden />
            신청 전용
          </span>
        </div>
      </header>
    );
  }

  const admin = await isAdmin();
  return (
    <header className="border-b border-stone-200 bg-white/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-4 md:min-h-20 md:flex-nowrap md:py-0">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:flex-none"
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
        <SiteNav isAdmin={admin} />
      </div>
    </header>
  );
}
