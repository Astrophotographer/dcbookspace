"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
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
 * 상단/하단 네비게이션.
 * - 모바일: 화면 하단 고정 탭바. 엄지 접근성이 좋고 헤더 가로 스크롤을 없앤다.
 * - 데스크톱: 기존처럼 헤더 오른쪽의 상단 네비게이션.
 */
export function SiteNav({ isAdmin }: Props) {
  const pathname = usePathname() ?? "/";

  return (
    <>
      <nav
        aria-label="주요 메뉴"
        className="hidden items-center gap-1 rounded-full border border-stone-200 bg-white/85 p-1 text-base shadow-sm md:flex"
      >
        <DesktopNavLink href="/" active={isActive(pathname, "/")}>
          현황판보기
        </DesktopNavLink>

        <DesktopNavLink
          href="/reservations"
          active={isActive(pathname, "/reservations")}
        >
          모든 신청내역
        </DesktopNavLink>

        <DesktopNavLink href="/notices" active={isActive(pathname, "/notices")}>
          공지사항
        </DesktopNavLink>

        {isAdmin ? (
          // 활성화 상태에서도 누르면 그냥 /admin 으로 이동 — 로그아웃은 /admin
          // 페이지 안의 별도 버튼에서만 가능하게 해서 실수로 풀리는 걸 막는다.
          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
            title="관리자 모드 활성 — 누르면 관리 메뉴로 이동"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span>관리자</span>
            <span className="text-xs font-normal text-emerald-700">
              · 활성화중
            </span>
          </Link>
        ) : (
          <DesktopNavLink href="/admin" active={isActive(pathname, "/admin")}>
            관리자
          </DesktopNavLink>
        )}

        {/* 장소신청 — 데스크톱 primary CTA. 모바일에서는 별도 FAB 로 노출한다. */}
        <Link
          href="/apply"
          className={cn(
            "inline-flex min-h-12 items-center justify-center rounded-full px-4 py-3 font-bold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
            isActive(pathname, "/apply")
              ? "bg-brand-700 ring-2 ring-brand-200"
              : "bg-brand-600 hover:bg-brand-700",
          )}
        >
          장소사용신청
        </Link>
      </nav>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 grid grid-cols-4 gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 text-[0.8rem] shadow-[0_12px_32px_rgba(28,25,23,0.18)] backdrop-blur md:hidden"
      >
        <MobileTabLink
          href="/"
          active={isActive(pathname, "/")}
          icon={LayoutDashboard}
        >
          현황판
        </MobileTabLink>

        <MobileTabLink
          href="/reservations"
          active={isActive(pathname, "/reservations")}
          icon={ClipboardList}
        >
          신청내역
        </MobileTabLink>

        <MobileTabLink
          href="/notices"
          active={isActive(pathname, "/notices")}
          icon={Megaphone}
        >
          공지
        </MobileTabLink>

        <MobileTabLink
          href="/admin"
          active={isActive(pathname, "/admin")}
          icon={ShieldCheck}
          adminActive={isAdmin}
        >
          관리자
        </MobileTabLink>
      </nav>
    </>
  );
}

function DesktopNavLink({
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
        "inline-flex min-h-12 items-center justify-center rounded-full px-4 py-3 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
        active
          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
          : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
      )}
    >
      {children}
    </Link>
  );
}

function MobileTabLink({
  href,
  active,
  icon: Icon,
  adminActive = false,
  children,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  adminActive?: boolean;
  children: React.ReactNode;
}) {
  const highlighted = active || adminActive;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 font-bold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
        adminActive
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          : highlighted
            ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-950",
      )}
      title={adminActive ? "관리자 모드 활성" : undefined}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span>{children}</span>
    </Link>
  );
}
