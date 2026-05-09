"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * 모바일 전용 떠다니는 "장소신청" 버튼.
 * 데스크톱(sm+) 에서는 헤더의 파란 CTA 가 잘 보이지만, 모바일에서는
 * 헤더가 스크롤 위로 올라가면 안 보여서 기능 접근성이 떨어진다.
 * 화면 우하단에 항상 떠 있는 pill 버튼으로 보강.
 *
 * 노출 안 하는 페이지:
 *   - /apply, /apply/* (이미 신청 폼)
 *   - /admin, /admin/* (관리자 컨텍스트)
 *   - /sign/* (결재자 PIN 입력)
 *   - /reservations/[id]/print, /series/[id]/print (인쇄용)
 */
export function MobileApplyFab() {
  const pathname = usePathname() ?? "/";

  const HIDE_PREFIXES = ["/apply", "/admin", "/sign"];
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }
  if (pathname.endsWith("/print")) return null;

  return (
    <Link
      href="/apply"
      aria-label="장소 신청"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg ring-1 ring-brand-700/20 transition-all hover:bg-brand-700 hover:shadow-xl active:scale-95 sm:hidden"
    >
      <Plus className="h-5 w-5" aria-hidden />
      장소신청
    </Link>
  );
}
