"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ArrowRight,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  CircleSlash,
  Clock,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import type { ReservationDetail } from "@/lib/repo";
import type { FixedEventInstance } from "@/lib/recurrence";
import { cn, formatKst as format, formatDuration, formatTime } from "@/lib/utils";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_LABEL_SHORT,
} from "@/lib/reservation-status";
import { useUrlModal } from "@/lib/use-url-modal";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

type Props = {
  currentDate: string;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  reservations: ReservationDetail[];
  fixedEvents?: FixedEventInstance[];
  /** 관리자면 일회성 신청 클릭 시 /admin/reservations/[id] 로 직행 */
  isAdmin?: boolean;
};

function reservationHref(id: string, isAdmin: boolean | undefined): string {
  return isAdmin ? `/admin/reservations/${id}` : `/reservations/${id}`;
}

type RoomState = "empty" | "pending" | "approved" | "mixed";

function statusFor(reservations: ReservationDetail[], roomId: string): RoomState {
  const list = reservations.filter((r) => r.room_id === roomId);
  if (list.length === 0) return "empty";
  const stati = list.map(displayStatus);
  const hasConfirmed = stati.some((s) => s === "confirmed");
  const hasInProgress = stati.some(
    (s) => s === "submitted" || s === "in_review",
  );
  if (hasConfirmed && hasInProgress) return "mixed";
  if (hasConfirmed) return "approved";
  return "pending";
}

const STATE_COLOR: Record<RoomState, string> = {
  empty:    "bg-stone-50    border-stone-300   text-stone-700   hover:bg-stone-100",
  pending:  "bg-yellow-100   border-yellow-500  text-yellow-900  hover:bg-yellow-200",
  mixed:    "bg-emerald-100  border-emerald-500 text-emerald-900 hover:bg-emerald-200",
  approved: "bg-sky-100      border-sky-500     text-sky-900     font-semibold hover:bg-sky-200",
};

const STATE_LABEL: Record<RoomState, string> = {
  empty:    "비어있음",
  pending:  "결재 대기중",
  mixed:    "결재 진행중",
  approved: "장소사용확정",
};

// 색맹/색약 사용자도 호실 점유를 알 수 있도록 색 + 아이콘 다중 신호
const STATE_ICON: Record<RoomState, LucideIcon> = {
  empty:    CircleSlash,
  pending:  Clock,
  mixed:    ArrowRight,
  approved: CircleCheck,
};

// 전체보기/전체 탭의 센티넬 — 빈 문자열은 "선택 없음" 의미와 충돌하지 않게 분리.
const ALL = "__all__";

export function BuildingView({
  currentDate,
  buildings,
  floors,
  rooms,
  reservations,
  fixedEvents = [],
  isAdmin,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  // 디폴트: [전체보기] — 모든 건물·모든 층을 한눈에
  const [buildingId, setBuildingId] = useState<string>(ALL);
  const [floorId, setFloorId] = useState<string>(ALL);

  // 가로 탭 strip 용 — display_order ASC (낮은 층이 왼쪽).
  const visibleFloors = floors.filter((f) => f.building_id === buildingId);
  // 세로 스택용 — DESC (위가 위층, 건물 단면도 메타포). slice() 로 원본 보호.
  const visibleFloorsStacked = visibleFloors.slice().reverse();
  const visibleRooms = rooms.filter((r) => r.floor_id === floorId);

  // 보기 모드 결정
  // - all-buildings: 전체보기 (모든 건물·모든 층·모든 호실 한꺼번에)
  // - all-floors:    특정 건물의 모든 층 한꺼번에
  // - single-floor:  기존 단일 층 화면
  const viewMode: "all-buildings" | "all-floors" | "single-floor" =
    buildingId === ALL
      ? "all-buildings"
      : floorId === ALL
        ? "all-floors"
        : "single-floor";

  const goToDate = (target: Date) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("date", format(target, "yyyy-MM-dd"));
    router.push(`?${sp.toString()}`);
  };
  const shiftDate = (days: number) =>
    goToDate(addDays(parseISO(currentDate), days));

  const dateObj = parseISO(currentDate);
  const dateLabel = format(dateObj, "yyyy/MM/dd (E)", { locale: ko });

  return (
    <div className="space-y-4">
      {/* 날짜 네비게이션 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-sm sm:gap-3 sm:p-3">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold text-stone-900 sm:text-lg">
            {dateLabel}
          </div>
          <DatePickerButton currentDate={currentDate} onPick={goToDate} />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <NavButton
            onClick={() => shiftDate(-7)}
            label="이전 주"
            title="이전 주 (한 주 전)"
          >
            <ChevronsLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </NavButton>
          <NavButton
            onClick={() => shiftDate(-1)}
            label="전날"
            title="전날"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </NavButton>
          <button
            type="button"
            onClick={() => goToDate(new Date())}
            className="h-11 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:text-base"
          >
            오늘
          </button>
          <NavButton
            onClick={() => shiftDate(1)}
            label="다음날"
            title="다음날"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </NavButton>
          <NavButton
            onClick={() => shiftDate(7)}
            label="다음 주"
            title="다음 주 (한 주 후)"
          >
            <ChevronsRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </NavButton>
        </div>
      </div>

      {/* 건물 탭 — 맨 앞에 [전체보기] */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setBuildingId(ALL);
            setFloorId(ALL);
          }}
          className={cn(
            "h-11 rounded-lg border px-4 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
            buildingId === ALL
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
          )}
        >
          전체보기
        </button>
        {buildings.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setBuildingId(b.id);
              const firstFloor = floors.find((f) => f.building_id === b.id);
              setFloorId(firstFloor?.id ?? "");
            }}
            className={cn(
              "h-11 rounded-lg border px-4 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
              buildingId === b.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* 상태 범례 — 건물 탭과 건물 카드 사이 별도 row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
        {(["pending", "mixed", "approved"] as RoomState[]).map((s) => {
          const Icon = STATE_ICON[s];
          return (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border",
                  STATE_COLOR[s],
                )}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
              </span>
              {STATE_LABEL[s]}
            </span>
          );
        })}
      </div>

      {/* 층 탭 — 특정 건물 선택 시에만 노출. 맨 앞에 [전체] */}
      {viewMode !== "all-buildings" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFloorId(ALL)}
            className={cn(
              "h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
              floorId === ALL
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            전체
          </button>
          {visibleFloors.map((f) => (
            <button
              key={f.id}
              onClick={() => setFloorId(f.id)}
              className={cn(
                "h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                floorId === f.id
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* 본문 — 모드별 분기 */}
      {viewMode === "single-floor" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          {visibleRooms.some((r) => r.map_x != null) ? (
            <>
              {/* 도면(RoomMap) 은 16:10 절대좌표라 360px 모바일에선 박스가 너무
                  작아져 가독성이 무너짐. 모바일에선 RoomGrid 로 폴백,
                  태블릿(sm) 이상에서만 도면 노출. */}
              <div className="hidden sm:block">
                <RoomMap
                  currentDate={currentDate}
                  rooms={visibleRooms}
                  reservations={reservations}
                  fixedEvents={fixedEvents}
                  isAdmin={isAdmin}
                />
              </div>
              <div className="sm:hidden">
                <RoomGrid
                  currentDate={currentDate}
                  rooms={visibleRooms}
                  reservations={reservations}
                  fixedEvents={fixedEvents}
                  isAdmin={isAdmin}
                />
              </div>
            </>
          ) : (
            <RoomGrid
              currentDate={currentDate}
              rooms={visibleRooms}
              reservations={reservations}
              fixedEvents={fixedEvents}
              isAdmin={isAdmin}
            />
          )}
        </div>
      )}

      {viewMode === "all-floors" && (
        <FloorsOverview
          floors={visibleFloorsStacked}
          rooms={rooms.filter((r) =>
            visibleFloorsStacked.some((f) => f.id === r.floor_id),
          )}
          reservations={reservations}
          fixedEvents={fixedEvents}
          currentDate={currentDate}
          isAdmin={isAdmin}
        />
      )}

      {viewMode === "all-buildings" && (
        <div className="space-y-6">
          {buildings.map((b) => {
            // visibleFloors 와 동일 — 위가 위층 정책
            const bFloors = floors
              .filter((f) => f.building_id === b.id)
              .slice()
              .reverse();
            const bRooms = rooms.filter((r) =>
              bFloors.some((f) => f.id === r.floor_id),
            );
            return (
              <section
                key={b.id}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
              >
                <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-3">
                  <h2 className="text-lg font-bold text-stone-900">{b.name}</h2>
                  <span className="text-xs text-stone-500">
                    {bFloors.length}개 층 · {bRooms.length}개 호실
                  </span>
                </header>
                <div className="p-4">
                  <FloorsOverview
                    floors={bFloors}
                    rooms={bRooms}
                    reservations={reservations}
                    fixedEvents={fixedEvents}
                    currentDate={currentDate}
                    bare
                    isAdmin={isAdmin}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 한 건물 또는 여러 건물의 모든 층을 한 화면에 펼쳐 보여준다.
 * 각 층은 라벨 헤더 + 호실 그리드로 구성. 호실 도면 좌표는 무시(여러 층을
 * 동시에 보는 화면에서는 그리드가 더 스캔하기 좋음).
 *
 * `bare`: 부모가 이미 카드 컨테이너를 가진 경우(전체보기에서 건물 카드 안)
 * 자기 자신의 카드 테두리를 빼서 시각적 중복 제거.
 */
function FloorsOverview({
  floors,
  rooms,
  reservations,
  fixedEvents,
  currentDate,
  bare,
  isAdmin,
}: {
  floors: Floor[];
  rooms: Room[];
  reservations: ReservationDetail[];
  fixedEvents: FixedEventInstance[];
  currentDate: string;
  bare?: boolean;
  isAdmin?: boolean;
}) {
  if (floors.length === 0) {
    return <EmptyState title="등록된 층이 없습니다." />;
  }

  const inner = (
    <div className="space-y-5">
      {floors.map((f) => {
        const floorRooms = rooms.filter((r) => r.floor_id === f.id);
        return (
          <div key={f.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="inline-flex h-7 items-center rounded-md bg-stone-100 px-2.5 text-sm font-bold text-stone-800">
                {f.label}
              </span>
              <span className="text-xs text-stone-500">
                {floorRooms.length}개 호실
              </span>
            </div>
            {floorRooms.length === 0 ? (
              <EmptyState
                variant="compact"
                title="이 층에는 등록된 호실이 없어요"
              />
            ) : (
              <RoomGrid
                currentDate={currentDate}
                rooms={floorRooms}
                reservations={reservations}
                fixedEvents={fixedEvents}
                isAdmin={isAdmin}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  if (bare) return inner;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      {inner}
    </div>
  );
}

/**
 * 날짜 라벨 옆 달력 버튼.
 * <label> 로 visible 한 아이콘+텍스트와 실제 <input type="date"> 를 묶어서,
 * 어디를 클릭해도 input 으로 위임 → 네이티브 date picker 가 열림.
 * 명시적 showPicker() 호출로 일부 브라우저(특히 모바일)에서의 누락도 보완.
 */
function DatePickerButton({
  currentDate,
  onPick,
}: {
  currentDate: string;
  onPick: (d: Date) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className="relative flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 focus-within:ring-2 focus-within:ring-brand-400 focus-within:ring-offset-2 sm:text-base">
      <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
      <span className="hidden sm:inline">달력</span>
      <input
        ref={inputRef}
        type="date"
        value={currentDate}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onPick(parseISO(v));
        }}
        onClick={() => {
          // showPicker 가 지원되는 환경에서는 명시적으로 호출 — 일부 데스크톱
          // Safari/Firefox 가 click 만으로는 picker 를 안 띄우는 경우가 있음.
          const inp = inputRef.current;
          if (inp && typeof inp.showPicker === "function") {
            try {
              inp.showPicker();
            } catch {
              /* user gesture 미충족 등은 무시 — 기본 click 동작이 fallback */
            }
          }
        }}
        aria-label="날짜 선택"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function NavButton({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

function RoomMap({
  currentDate,
  rooms,
  reservations,
  fixedEvents,
  isAdmin,
}: {
  currentDate: string;
  rooms: Room[];
  reservations: ReservationDetail[];
  fixedEvents: FixedEventInstance[];
  isAdmin?: boolean;
}) {
  // URL ?room=<id> 기반 — detail 페이지에서 뒤로가기 시 모달 자동 복원
  const [modalRoomId, openRoomModal, closeRoomModal] = useUrlModal("room");
  const modalRoom = modalRoomId
    ? rooms.find((r) => r.id === modalRoomId) ?? null
    : null;
  const modalList = modalRoomId
    ? reservations.filter((res) => res.room_id === modalRoomId)
    : [];
  const modalFixedList = modalRoomId
    ? fixedEvents.filter((e) => e.room_id === modalRoomId)
    : [];

  return (
    <>
      {/* 도면은 16:10 비율 유지 — 호실 좌표(%)가 그 비율에 맞춰 그려졌기 때문.
          모바일에서도 동일 비율, 일부 브라우저에서 Tailwind aspect-[] 가 안 잡히는
          경우를 대비해 inline style 도 같이. */}
      <div
        className="relative w-full"
        style={{ aspectRatio: "16 / 10", maxHeight: "min(70vh, 600px)" }}
      >
        {rooms.map((r) => {
          const state = statusFor(reservations, r.id);
          const list = reservations.filter((res) => res.room_id === r.id);
          const fixedList = fixedEvents.filter((e) => e.room_id === r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => openRoomModal(r.id)}
              className={cn(
                "absolute flex flex-col overflow-hidden rounded-lg border p-2 text-left text-[11px] leading-tight transition-colors",
                STATE_COLOR[state],
              )}
              style={{
                left: `${r.map_x ?? 0}%`,
                top: `${r.map_y ?? 0}%`,
                width: `${r.map_w ?? 20}%`,
                height: `${r.map_h ?? 20}%`,
              }}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="flex items-baseline gap-1 text-sm font-bold">
                  {(() => {
                    const Icon = STATE_ICON[state];
                    return (
                      <Icon
                        aria-hidden
                        className={cn(
                          "h-3.5 w-3.5 self-center",
                        )}
                      />
                    );
                  })()}
                  {r.name}
                </span>
                {(list.length > 0 || fixedList.length > 0) && (
                  <span className="text-[10px] opacity-80">
                    {list.length + fixedList.length}건
                  </span>
                )}
              </div>
              {list.length === 0 && fixedList.length === 0 ? (
                <div className="text-xs opacity-80">{STATE_LABEL[state]}</div>
              ) : (
                <ul className="mt-1 space-y-1 overflow-hidden">
                  {fixedList.slice(0, 2).map((ev) => (
                    <li
                      key={ev.id}
                      className="leading-tight rounded bg-stone-200/70 px-1 py-0.5 text-stone-800"
                    >
                      <div className="font-semibold">[고정] {ev.name}</div>
                      <div className="font-mono opacity-80">
                        {formatTime(ev.start_at)}–{formatTime(ev.end_at)}
                      </div>
                    </li>
                  ))}
                  {list.slice(0, 3).map((res) => {
                    const ds = displayStatus(res);
                    const purposeShort =
                      res.purpose.length > 5
                        ? `${res.purpose.slice(0, 5)}…`
                        : res.purpose;
                    return (
                      <li key={res.id} className="leading-tight">
                        <div className="font-semibold">
                          [{STATUS_LABEL[ds]}]
                        </div>
                        <div className="font-mono">
                          {formatTime(res.start_at)}–{formatTime(res.end_at)}
                        </div>
                        <div className="truncate opacity-90">
                          {res.dept?.name ?? "?"} {purposeShort}
                        </div>
                      </li>
                    );
                  })}
                  {list.length > 3 && (
                    <li className="opacity-70">+{list.length - 3}건</li>
                  )}
                </ul>
              )}
            </button>
          );
        })}
      </div>
      {modalRoom && (
        <RoomDetailModal
          room={modalRoom}
          list={modalList}
          fixedList={modalFixedList}
          currentDate={currentDate}
          onClose={closeRoomModal}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

function RoomDetailModal({
  room,
  list,
  fixedList,
  currentDate,
  onClose,
  isAdmin,
}: {
  room: Room;
  list: ReservationDetail[];
  fixedList: FixedEventInstance[];
  currentDate: string;
  onClose: () => void;
  isAdmin?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const applyHref = `/apply?date=${encodeURIComponent(currentDate)}&room_id=${encodeURIComponent(room.id)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${room.name} 예약 목록`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900">{room.name}</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              예약 {list.length}건
              {fixedList.length > 0 && ` · 고정 행사 ${fixedList.length}건`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-m-2 flex h-11 w-11 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          {fixedList.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold text-stone-500">
                고정 행사
              </div>
              <ul className="space-y-2">
                {fixedList.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-xl border border-stone-300 bg-stone-100 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-stone-700">
                        {formatTime(ev.start_at)} – {formatTime(ev.end_at)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-800">
                        고정
                      </span>
                    </div>
                    <div className="mt-1 text-base font-medium text-stone-900">
                      {ev.name}
                    </div>
                    {ev.notes && (
                      <div className="mt-0.5 text-xs text-stone-500">
                        {ev.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {list.length === 0 && fixedList.length === 0 ? (
            <EmptyState title="이 호실에 신청된 예약이 없습니다" />
          ) : list.length === 0 ? null : (
            <ul className="space-y-2">
              {list.map((res) => {
                const ds = displayStatus(res);
                const Icon = STATUS_ICON[ds];
                return (
                  <li key={res.id}>
                    <Link
                      href={reservationHref(res.id, isAdmin)}
                      className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-3 transition-colors hover:bg-stone-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-stone-600">
                          {formatTime(res.start_at)} – {formatTime(res.end_at)}
                        </span>
                        <span className="text-xs text-stone-500">
                          ({formatDuration(res.start_at, res.end_at)})
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_BADGE_CLASS[ds],
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                          {STATUS_LABEL_SHORT[ds]}
                        </span>
                      </div>
                      <div className="text-sm text-stone-700">
                        <span className="font-medium text-stone-900">
                          {res.dept?.name ?? "(부서 미지정)"}
                        </span>
                        <span className="mx-1 text-stone-400">·</span>
                        {res.purpose}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-stone-200 px-6 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-stone-300 bg-white px-5 text-base font-medium text-stone-800 hover:bg-stone-50"
          >
            닫기
          </button>
          <Link
            href={applyHref}
            prefetch={false}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <CalendarPlus className="h-5 w-5" aria-hidden />
            이 날짜/장소로 예약하기
          </Link>
        </div>
      </div>
    </div>
  );
}

function RoomGrid({
  currentDate,
  rooms,
  reservations,
  fixedEvents,
  isAdmin,
}: {
  currentDate: string;
  rooms: Room[];
  reservations: ReservationDetail[];
  fixedEvents: FixedEventInstance[];
  isAdmin?: boolean;
}) {
  // RoomMap 과 동일 모달 패턴 + URL 백업 — detail 갔다 뒤로가기 시 모달 자동 복원.
  const [modalRoomId, openRoomModal, closeRoomModal] = useUrlModal("room");
  const modalRoom = modalRoomId
    ? rooms.find((r) => r.id === modalRoomId) ?? null
    : null;
  const modalList = modalRoomId
    ? reservations.filter((res) => res.room_id === modalRoomId)
    : [];
  const modalFixedList = modalRoomId
    ? fixedEvents.filter((e) => e.room_id === modalRoomId)
    : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {rooms.map((r) => {
          const state = statusFor(reservations, r.id);
          const list = reservations.filter((res) => res.room_id === r.id);
          const fixedList = fixedEvents.filter((e) => e.room_id === r.id);
          const isEmpty = list.length === 0 && fixedList.length === 0;
          const summaryLabel =
            list.length === 0 && fixedList.length > 0
              ? "고정 일정"
              : STATE_LABEL[state];
          const summaryCount = list.length + fixedList.length;
          const SummaryIcon =
            list.length === 0 && fixedList.length > 0
              ? CalendarDays
              : STATE_ICON[state];
          return (
            <button
              key={r.id}
              id={`room-${r.id}`}
              type="button"
              onClick={() => openRoomModal(r.id)}
              className={cn(
                "flex min-h-16 flex-col justify-center rounded-lg border p-2 text-left transition-colors",
                STATE_COLOR[state],
              )}
            >
              <div className="flex items-center gap-1">
                <span className="font-bold">{r.name}</span>
                {fixedList.length > 0 && (
                  <span className="rounded bg-stone-200/80 px-1 text-[10px] font-medium text-stone-700">
                    고정
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs opacity-80">
                <SummaryIcon aria-hidden className="h-3.5 w-3.5" />
                <span>{summaryLabel}</span>
                {!isEmpty && <span>· {summaryCount}건</span>}
              </div>
            </button>
          );
        })}
      </div>
      {modalRoom && (
        <RoomDetailModal
          room={modalRoom}
          list={modalList}
          fixedList={modalFixedList}
          currentDate={currentDate}
          onClose={closeRoomModal}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}
