"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * 명시적 "뒤로" 버튼. router.back() 사용.
 *
 * 왜 필요한가:
 * - PWA standalone 모드 (홈 화면에 추가) 엔 브라우저 chrome 없음 → 뒤로가기 버튼 없음
 * - iOS Safari 의 < 화살표는 fullscreen 모드에서 가려질 수 있음
 * - 어르신 사용자에게 명시적 UI 가 안전
 *
 * router.back() 효과:
 * - 직전 entry 가 모달 열린 상태 (?room=X) 였으면 → 그 상태로 복원
 * - 직전 entry 가 없는 경우 (직접 URL 접근) → 브라우저가 자체 fallback
 *
 * fallbackHref: history 가 없을 때 (직접 URL 접근 등) 대체 경로.
 */
type Props = {
  label?: string;
  fallbackHref?: string;
};

export function BackLink({ label = "뒤로", fallbackHref = "/" }: Props) {
  const router = useRouter();

  function handleBack() {
    // history.length 가 1 이면 직접 접근 — fallback 경로로
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push(fallbackHref);
      return;
    }
    router.back();
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
