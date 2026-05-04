"use client";

import { useState } from "react";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import type { ReservationDetail } from "@/lib/repo";
import { cn, formatTime } from "@/lib/utils";
import { displayStatus, STATUS_LABEL } from "@/lib/reservation-status";
import Link from "next/link";

type Props = {
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

export function BuildingView({ buildings, floors, rooms, reservations }: Props) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const buildingFloors = floors.filter((f) => f.building_id === buildingId);
  const [floorId, setFloorId] = useState(buildingFloors[0]?.id ?? "");

  const visibleFloors = floors.filter((f) => f.building_id === buildingId);
  const visibleRooms = rooms.filter((r) => r.floor_id === floorId);

  return (
    <div className="space-y-4">
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

      {/* 호실 그리드 (도면 좌표가 있으면 도면, 없으면 그리드) */}
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

function RoomMap({
  rooms,
  reservations,
}: {
  rooms: Room[];
  reservations: ReservationDetail[];
}) {
  return (
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
            className={cn(
              "absolute overflow-hidden rounded-lg border-2 p-2 text-left text-sm",
              STATE_COLOR[state],
            )}
            style={{
              left: `${r.map_x ?? 0}%`,
              top: `${r.map_y ?? 0}%`,
              width: `${r.map_w ?? 20}%`,
              height: `${r.map_h ?? 20}%`,
            }}
            onClick={() => {
              const elem = document.getElementById(`room-${r.id}`);
              elem?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <div className="font-bold">{r.name}</div>
            <div className="text-xs opacity-80">
              {state === "empty" ? "비어있음" : `${list.length}건`}
            </div>
          </button>
        );
      })}
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
            <div className="text-xs opacity-80">
              {STATE_LABEL[state]}
              {r.capacity ? ` · 정원 ${r.capacity}` : ""}
            </div>
            {list.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {list.slice(0, 3).map((res) => {
                  const ds = displayStatus(res);
                  return (
                    <li key={res.id}>
                      <Link
                        href={`/reservations/${res.id}`}
                        className="hover:underline"
                      >
                        <span className="font-semibold">
                          [{STATUS_LABEL[ds]}]
                        </span>{" "}
                        {formatTime(res.start_at)}–{formatTime(res.end_at)} ·{" "}
                        {res.dept?.name ?? "?"}
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
