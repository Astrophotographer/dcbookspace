"use client";

import { useRef, useState } from "react";
import { CalendarDays, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";

const REALTIME_TABLES = ["rooms", "reservations", "approvals"] as const;

type Tab = "date" | "place";

type Props = {
  dateView: React.ReactNode;
  placeView: React.ReactNode;
};

/**
 * 두 뷰를 가로로 나란히 두고 scroll-snap 으로 한 번에 한 페이지씩 보이게 한다.
 *  - 모바일: 손가락 스와이프 → 네이티브 스크롤로 부드럽게 전환
 *  - 데스크톱: 탭 버튼 클릭 → 프로그래매틱 스무스 스크롤
 *  - 탭 인디케이터(파란 underline)는 transform 으로 슬라이딩 → 페이지 이동과
 *    함께 자연스럽게 따라감
 *
 * tab state ↔ 스크롤 위치 동기화 정책: 스크롤 위치가 source of truth.
 *  - 탭 클릭은 scrollTo() 만 호출. tab state 는 onScroll 에서 갱신.
 *  - 사용자 swipe 도 onScroll 만으로 처리. 양방향 effect 루프 회피.
 */
export function HomeTabs({ dateView, placeView }: Props) {
  useRealtimeRefresh(REALTIME_TABLES);
  const [tab, setTab] = useState<Tab>("date");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    // 한 페이지 = clientWidth. round 로 가장 가까운 페이지 인덱스 결정.
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const next: Tab = idx === 0 ? "date" : "place";
    if (next !== tab) setTab(next);
  };

  const goTab = (target: Tab) => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = target === "date" ? 0 : el.clientWidth;
    el.scrollTo({ left, behavior: "smooth" });
  };

  // 토글 영역에서 좌우 스와이프 → 탭 전환.
  // (콘텐츠 영역은 이미 native 가로 스크롤로 swipe 동작)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 40; // px. 너무 작으면 탭 클릭과 충돌, 너무 크면 어색
  const onToggleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };
  const onToggleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // 가로 이동이 세로 이동보다 명확히 클 때만 — 세로 스크롤 의도 보호
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    goTab(dx < 0 ? "place" : "date");
  };

  return (
    <div>
      {/* 토글(segmented control) — 모바일은 가로 꽉, 데스크톱은 좌측 끝 정렬. */}
      <div role="tablist" className="mb-4 flex">
        <div
          className="inline-flex w-full touch-pan-y rounded-full bg-stone-100 p-1 sm:w-auto"
          onTouchStart={onToggleTouchStart}
          onTouchEnd={onToggleTouchEnd}
        >
          <button
            role="tab"
            type="button"
            aria-selected={tab === "date"}
            onClick={() => goTab("date")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 sm:flex-none sm:px-6 sm:py-3 sm:text-base",
              tab === "date"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900",
            )}
          >
            <CalendarDays className="h-5 w-5" />
            날짜별
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={tab === "place"}
            onClick={() => goTab("place")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 sm:flex-none sm:px-6 sm:py-3 sm:text-base",
              tab === "place"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900",
            )}
          >
            <Building2 className="h-5 w-5" />
            장소별
          </button>
        </div>
      </div>

      {/* 가로 스크롤 + snap. 스크롤바는 시각적으로 숨김 (스와이프 메타포 유지). */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className={cn(
          "flex w-full snap-x snap-mandatory items-start overflow-x-auto",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <section
          role="tabpanel"
          aria-label="날짜별 보기"
          className="w-full flex-none snap-start"
        >
          {dateView}
        </section>
        <section
          role="tabpanel"
          aria-label="장소별 보기"
          className="w-full flex-none snap-start"
        >
          {placeView}
        </section>
      </div>
    </div>
  );
}
