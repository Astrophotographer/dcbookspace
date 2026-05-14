"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, Building2, Clock, ArrowRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import type { ReservationDetail } from "@/lib/repo";
import type { FixedEventInstance } from "@/lib/recurrence";

// 달력 태그 색·아이콘 — 자연 + 파스텔 톤 (저채도).
// 대기=마른 풀(yellow), 진행=잎사귀(emerald, →), 확정=파스텔 하늘(sky).
// building-view STATE_COLOR 와 동일 체계.
const LEGEND_ITEMS = [
  {
    key: "pending",
    label: "결재 대기중",
    color: "bg-yellow-100 border-yellow-500 text-yellow-900",
    Icon: Clock,
  },
  {
    key: "mixed",
    label: "결재 진행중",
    color: "bg-emerald-100 border-emerald-500 text-emerald-900",
    Icon: ArrowRight,
  },
  {
    key: "approved",
    label: "장소사용확정",
    color: "bg-sky-100 border-sky-500 text-sky-900",
    Icon: CircleCheck,
  },
] as const;

// BuildingView 는 사용자가 "장소별" 탭을 한 번이라도 열기 전까지 다운로드/평가되지 않음.
// 첫 페이지 진입 시 ~30~40KB 의 client JS 가 절약됨.
const BuildingViewLazy = dynamic(
  () =>
    import("@/components/building-view").then((m) => ({
      default: m.BuildingView,
    })),
  {
    loading: () => (
      <div className="h-96 animate-pulse rounded-2xl bg-stone-100" />
    ),
  },
);

type BuildingViewProps = {
  currentDate: string;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  reservations: ReservationDetail[];
  fixedEvents?: FixedEventInstance[];
  isAdmin?: boolean;
};

type Tab = "date" | "place";

type Props = {
  dateView: React.ReactNode;
  buildingViewProps: BuildingViewProps;
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
 *  - 현황판 진입 기본값은 항상 "날짜별". 마지막 탭은 저장하지 않는다.
 */
export function HomeTabs({ dateView, buildingViewProps }: Props) {
  // 홈은 조회 전용이라 realtime 구독을 끔. /admin/* 와 /reservations 상세 페이지에만 활성.
  const [tab, setTab] = useState<Tab>("date");
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 한 번이라도 장소별을 열어 본 적 있으면 이후로는 unmount 하지 않음.
  // 매 탭 전환마다 BuildingView 가 다시 mount 되는 비용 회피.
  // 이벤트 핸들러에서 직접 set — effect 안 setState 룰 회피.
  const [hasOpenedPlace, setHasOpenedPlace] = useState(false);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    // 한 페이지 = clientWidth. round 로 가장 가까운 페이지 인덱스 결정.
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const next: Tab = idx === 0 ? "date" : "place";
    if (next !== tab) {
      setTab(next);
    }
    if (next === "place") setHasOpenedPlace(true);
  };

  const goTab = (target: Tab) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (target === "place") setHasOpenedPlace(true);
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
      {/* 제목 라인 + 토글(segmented control). 모든 신청내역 탭과 같은 배치. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-stone-900">예약 현황</h1>
        <div
          role="tablist"
          aria-label="예약 현황 보기 방식"
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

      {/* 달력 태그 범례 — 데스크탑에서만 노출 (모바일은 가로 공간 부족) */}
      <div className="mb-4 hidden flex-wrap items-center justify-end gap-3 text-xs sm:flex">
        {LEGEND_ITEMS.map(({ key, label, color, Icon }) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded border",
                color,
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </span>
            {label}
          </span>
        ))}
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
          {hasOpenedPlace ? (
            <BuildingViewLazy {...buildingViewProps} />
          ) : (
            <div className="h-96 animate-pulse rounded-2xl bg-stone-100" />
          )}
        </section>
      </div>
    </div>
  );
}
