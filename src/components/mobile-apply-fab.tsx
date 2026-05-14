"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * 모바일 전용 떠다니는 "장소사용신청" 버튼.
 * 데스크톱(md+) 에서는 헤더의 파란 CTA 가 잘 보이지만, 모바일에서는
 * 하단 탭바와 겹치지 않도록 화면 우측 상단에 떠 있는 pill 버튼으로 보강.
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
  if (
    HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return null;
  }
  if (pathname.endsWith("/print")) return null;

  return (
    <Link
      href="/apply"
      aria-label="장소사용신청"
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2.5 text-sm font-bold text-white shadow-lg ring-1 ring-brand-700/20 transition-all hover:bg-brand-700 hover:shadow-xl active:scale-95 md:hidden"
    >
      <Plus className="h-4 w-4" aria-hidden />
      장소사용신청
    </Link>
  );
}
