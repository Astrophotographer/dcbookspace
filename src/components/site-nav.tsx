"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** 관리자 로그인 상태 — 서버에서 isAdmin() 결과를 받아 옴 */
  isAdmin: boolean;
};

/**
 * 현재 경로와 nav 링크의 매칭 규칙.
 * - "/" → 정확히 일치할 때만 (그래야 다른 페이지에서 "현황판" 이 hover 처럼 보이지 않음)
 * - 그 외는 prefix 매칭 ("/admin/users" 도 "관리자" 활성).
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionLabel(pathname: string): string {
  if (isActive(pathname, "/apply")) return "장소신청";
  if (isActive(pathname, "/reservations")) return "모든 신청내역";
  if (isActive(pathname, "/notices")) return "공지사항";
  if (isActive(pathname, "/admin")) return "관리자";
  return "현황판";
}

export function CurrentSectionLabel() {
  const pathname = usePathname() ?? "/";

  return (
    <span className="mt-0.5 max-w-[14rem] truncate text-xs font-semibold leading-tight text-stone-500">
      장소 사용 신청 · {sectionLabel(pathname)}
    </span>
  );
}

/**
 * 상단 네비게이션. 현재 페이지는 brand 색으로 강하게 표시 + 아래쪽 underline.
 * 어르신도 "지금 어디 있나" 한눈에 알도록 대비 강조.
 */
export function SiteNav({ isAdmin }: Props) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="order-3 -mx-1 w-full flex-none overflow-x-auto px-1 pb-1 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0 md:pb-0">
      <nav
        aria-label="주요 메뉴"
        className="flex min-w-max items-center gap-1 text-sm sm:gap-1.5 sm:text-base"
      >
        <NavLink href="/" active={isActive(pathname, "/")}>
          <span className="sm:hidden">현황판</span>
          <span className="hidden sm:inline">현황판보기</span>
        </NavLink>

        <NavLink
          href="/reservations"
          active={isActive(pathname, "/reservations")}
        >
          <span className="sm:hidden">신청내역</span>
          <span className="hidden sm:inline">모든 신청내역</span>
        </NavLink>

        <NavLink href="/notices" active={isActive(pathname, "/notices")}>
          <Megaphone className="h-4 w-4 sm:hidden" aria-hidden />
          <span className="sm:hidden">공지</span>
          <span className="hidden sm:inline">공지사항</span>
        </NavLink>

        {isAdmin ? (
          // 활성화 상태에서도 누르면 그냥 /admin 으로 이동 — 로그아웃은 /admin
          // 페이지 안의 별도 버튼에서만 가능하게 해서 실수로 풀리는 걸 막는다.
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:min-h-12 sm:px-4 sm:py-3"
            title="관리자 모드 활성 — 누르면 관리 메뉴로 이동"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span>관리자</span>
            <span className="hidden text-xs font-normal text-emerald-700 sm:inline">
              · 활성화중
            </span>
          </Link>
        ) : (
          <NavLink href="/admin" active={isActive(pathname, "/admin")}>
            관리자
          </NavLink>
        )}

        {/* 장소신청 — primary CTA. brand color, 약간 더 두꺼운 글씨로 한눈에 띄게.
            현재 페이지일 때는 더 진하게 + 아래 underline 으로 "여기 보고 있어요" 신호. */}
        <Link
          href="/apply"
          className={cn(
            "relative inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 font-semibold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:min-h-12 sm:px-4 sm:py-3",
            isActive(pathname, "/apply")
              ? "bg-brand-800 ring-2 ring-brand-300"
              : "bg-brand-600 hover:bg-brand-700",
          )}
        >
          장소신청
          {isActive(pathname, "/apply") && <ActiveDot />}
        </Link>
      </nav>
    </div>
  );
}

/**
 * 일반 (회색 톤) nav 링크. 현재 페이지면 brand 색 배경 + 흰 글씨 + 아래 점.
 */
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:min-h-12 sm:px-4 sm:py-3",
        active
          ? "border-brand-200 bg-brand-50 font-bold text-brand-800 shadow-sm"
          : "border-transparent font-semibold text-stone-700 hover:border-stone-200 hover:bg-stone-100",
      )}
    >
      {children}
      {active && <ActiveDot />}
    </Link>
  );
}

/** 현재 페이지 표시 — 버튼 아래쪽 작은 ▾. 컬러 대비만으로 부족한 어르신께 추가 신호. */
function ActiveDot() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-xs leading-none text-brand-600"
    >
      ▾
    </span>
  );
}
