import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Tablet } from "lucide-react";
import { isAdmin } from "@/lib/admin-server";

type Props = {
  /** 키오스크 모드 — 사무실 태블릿 신청 전용. 네비 GUI 다 숨김 */
  kiosk?: boolean;
};

/**
 * Vercel 빌드 환경에 따라 staging 임을 한눈에 보여주는 배지.
 * - 'production' → 안 보임 (dcbook.vercel.app)
 * - 'preview' / 'development' / undefined → 노출 (dcbookspace.vercel.app, localhost 등)
 */
function StagingBadge() {
  if (process.env.VERCEL_ENV === "production") return null;
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white shadow-md sm:px-5 sm:py-1.5 sm:text-base">
      🧪 테스트용 페이지
    </span>
  );
}

export async function SiteHeader({ kiosk = false }: Props = {}) {
  // 키오스크 모드: 로고 + "신청 전용" 배지만. 다른 페이지로 갈 수 있는 GUI 0
  // — 어르신이 의도 외 영역으로 빠지는 사고 방지. Link 도 일반 div 로 (홈 이동 X).
  if (kiosk) {
    return (
      <header className="border-b border-stone-200 bg-white">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:h-20 sm:gap-4 sm:px-4">
          <StagingBadge />
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
    <header className="border-b border-stone-200 bg-white">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:h-20 sm:gap-4 sm:px-4">
        <StagingBadge />
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
          {admin ? (
            // 활성화 상태에서도 누르면 그냥 /admin 으로 이동 — 로그아웃은 /admin
            // 페이지 안의 별도 버튼에서만 가능하게 해서 실수로 풀리는 걸 막는다.
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
              title="관리자 모드 활성 — 누르면 관리 메뉴로 이동"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span>관리자</span>
              <span className="hidden text-xs font-normal text-emerald-700 sm:inline">
                · 활성화중
              </span>
            </Link>
          ) : (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-4 sm:py-3"
            >
              관리자
            </Link>
          )}
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
