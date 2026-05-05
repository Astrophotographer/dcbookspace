"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import type { ReservationDetail } from "@/lib/repo";
import { cn, formatTime } from "@/lib/utils";
import { displayStatus, STATUS_LABEL } from "@/lib/reservation-status";
import Link from "next/link";

type Props = {
  currentDate: string;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  reservations: ReservationDetail[];
};

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
  empty:    "bg-emerald-50  border-emerald-300 text-emerald-900 hover:bg-emerald-100",
  pending:  "bg-amber-50    border-amber-400   text-amber-900   hover:bg-amber-100",
  approved: "bg-red-50      border-red-400     text-red-900     hover:bg-red-100",
  mixed:    "bg-orange-50   border-orange-400  text-orange-900  hover:bg-orange-100",
};

const STATE_LABEL: Record<RoomState, string> = {
  empty:    "비어있음",
  pending:  "결재 진행중",
  approved: "확정",
  mixed:    "확정+진행중",
};

export function BuildingView({
  currentDate,
  buildings,
  floors,
  rooms,
  reservations,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const buildingFloors = floors.filter((f) => f.building_id === buildingId);
  const [floorId, setFloorId] = useState(buildingFloors[0]?.id ?? "");

  const visibleFloors = floors.filter((f) => f.building_id === buildingId);
  const visibleRooms = rooms.filter((r) => r.floor_id === floorId);

  const goToDate = (target: Date) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("date", format(target, "yyyy-MM-dd"));
    router.push(`?${sp.toString()}`);
  };
  const shiftDate = (days: number) =>
    goToDate(addDays(parseISO(currentDate), days));

  const dateObj = parseISO(currentDate);
  const dateLabel = format(dateObj, "yyyy년 M월 d일 (E)", { locale: ko });

  return (
    <div className="space-y-4">
      {/* 날짜 네비게이션 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="text-lg font-semibold text-stone-900">{dateLabel}</div>
        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => shiftDate(-7)}
            label="이전 주"
            title="이전 주 (한 주 전)"
          >
            <ChevronsLeft className="h-5 w-5" />
          </NavButton>
          <NavButton
            onClick={() => shiftDate(-1)}
            label="전날"
            title="전날"
          >
            <ChevronLeft className="h-5 w-5" />
          </NavButton>
          <button
            type="button"
            onClick={() => goToDate(new Date())}
            className="h-11 rounded-lg border border-stone-300 bg-white px-4 text-base font-medium text-stone-800 hover:bg-stone-50"
          >
            오늘
          </button>
          <NavButton
            onClick={() => shiftDate(1)}
            label="다음날"
            title="다음날"
          >
            <ChevronRight className="h-5 w-5" />
          </NavButton>
          <NavButton
            onClick={() => shiftDate(7)}
            label="다음 주"
            title="다음 주 (한 주 후)"
          >
            <ChevronsRight className="h-5 w-5" />
          </NavButton>
        </div>
      </div>

      {/* 건물 탭 */}
      <div className="flex flex-wrap gap-2">
        {buildings.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setBuildingId(b.id);
              const firstFloor = floors.find((f) => f.building_id === b.id);
              setFloorId(firstFloor?.id ?? "");
            }}
            className={cn(
              "h-11 rounded-lg border px-4 font-medium transition-colors",
              buildingId === b.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* 층 탭 */}
      <div className="flex flex-wrap gap-2">
        {visibleFloors.map((f) => (
          <button
            key={f.id}
            onClick={() => setFloorId(f.id)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium",
              floorId === f.id
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 호실 그리드 (도면 좌표가 있으면 도면, 없으면 그리드).
          도면 박스는 작아서 다 못 띄울 수 있으므로, 클릭하면 모달로 전체 표시. */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        {visibleRooms.some((r) => r.map_x != null) ? (
          <RoomMap rooms={visibleRooms} reservations={reservations} />
        ) : (
          <RoomGrid rooms={visibleRooms} reservations={reservations} />
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-sm">
        {(["empty", "pending", "approved", "mixed"] as RoomState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-4 w-4 rounded border", STATE_COLOR[s])} />
            {STATE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
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
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
    >
      {children}
    </button>
  );
}

function RoomMap({
  rooms,
  reservations,
}: {
  rooms: Room[];
  reservations: ReservationDetail[];
}) {
  const [modalRoomId, setModalRoomId] = useState<string | null>(null);
  const modalRoom = modalRoomId
    ? rooms.find((r) => r.id === modalRoomId) ?? null
    : null;
  const modalList = modalRoomId
    ? reservations.filter((res) => res.room_id === modalRoomId)
    : [];

  return (
    <>
      <div
        className="relative w-full"
        style={{ aspectRatio: "16 / 10", maxHeight: 600 }}
      >
        {rooms.map((r) => {
          const state = statusFor(reservations, r.id);
          const list = reservations.filter((res) => res.room_id === r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setModalRoomId(r.id)}
              className={cn(
                "absolute flex flex-col overflow-hidden rounded-lg border-2 p-2 text-left text-[11px] leading-tight",
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
                <span className="text-sm font-bold">{r.name}</span>
                {list.length > 0 && (
                  <span className="text-[10px] opacity-80">
                    {list.length}건
                  </span>
                )}
              </div>
              {list.length === 0 ? (
                <div className="text-xs opacity-80">비어있음</div>
              ) : (
                <ul className="mt-1 space-y-1 overflow-hidden">
                  {list.slice(0, 3).map((res) => {
                    const ds = displayStatus(res);
                    return (
                      <li key={res.id} className="leading-tight">
                        <div>
                          <span className="font-semibold">
                            [{STATUS_LABEL[ds]}]
                          </span>{" "}
                          {formatTime(res.start_at)}–
                          {formatTime(res.end_at)}
                        </div>
                        <div className="opacity-90">
                          {res.dept?.name ?? "?"} · {res.applicant.name}
                        </div>
                        {res.applicant.phone && (
                          <div className="font-mono opacity-80">
                            {res.applicant.phone}
                          </div>
                        )}
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
          onClose={() => setModalRoomId(null)}
        />
      )}
    </>
  );
}

function RoomDetailModal({
  room,
  list,
  onClose,
}: {
  room: Room;
  list: ReservationDetail[];
  onClose: () => void;
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
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
              이 호실에 신청된 예약이 없습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((res) => {
                const ds = displayStatus(res);
                return (
                  <li key={res.id}>
                    <Link
                      href={`/reservations/${res.id}`}
                      className="block rounded-xl border border-stone-200 bg-white p-3 transition-colors hover:bg-stone-50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-stone-600">
                          {formatTime(res.start_at)} – {formatTime(res.end_at)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                          {STATUS_LABEL[ds]}
                        </span>
                      </div>
                      <div className="mt-1 text-base font-medium text-stone-900">
                        {res.dept?.name ?? "(부서 미지정)"} ·{" "}
                        {res.applicant.name}
                      </div>
                      {res.applicant.phone && (
                        <div className="font-mono text-sm text-stone-700">
                          {res.applicant.phone}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-stone-500">
                        {res.purpose}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-stone-200 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-stone-300 bg-white px-5 text-base font-medium text-stone-800 hover:bg-stone-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomGrid({
  rooms,
  reservations,
}: {
  rooms: Room[];
  reservations: ReservationDetail[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {rooms.map((r) => {
        const state = statusFor(reservations, r.id);
        const list = reservations.filter((res) => res.room_id === r.id);
        return (
          <div
            key={r.id}
            id={`room-${r.id}`}
            className={cn(
              "flex min-h-32 flex-col rounded-lg border-2 p-3",
              STATE_COLOR[state],
            )}
          >
            <div className="mb-1 font-bold">{r.name}</div>
            <div className="text-xs opacity-80">{STATE_LABEL[state]}</div>
            {list.length > 0 && (
              <ul className="mt-2 space-y-2 text-xs">
                {list.slice(0, 3).map((res) => {
                  const ds = displayStatus(res);
                  return (
                    <li key={res.id}>
                      <Link
                        href={`/reservations/${res.id}`}
                        className="block leading-snug hover:underline"
                      >
                        <div>
                          <span className="font-semibold">
                            [{STATUS_LABEL[ds]}]
                          </span>{" "}
                          {formatTime(res.start_at)}–
                          {formatTime(res.end_at)}
                        </div>
                        <div className="opacity-90">
                          {res.dept?.name ?? "?"} · {res.applicant.name}
                        </div>
                        {res.applicant.phone && (
                          <div className="font-mono opacity-70">
                            {res.applicant.phone}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {list.length > 3 && (
                  <li className="text-stone-500">+{list.length - 3}건</li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
