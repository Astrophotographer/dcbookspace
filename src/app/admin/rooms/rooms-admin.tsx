"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";
import {
  createRoom,
  deleteRoom,
  updateRoomLayout,
  updateRoomMeta,
} from "./actions";

const REALTIME_TABLES = ["rooms"] as const;

type Props = {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
};

type Layout = { map_x: number; map_y: number; map_w: number; map_h: number };
type DragMode = "move" | "resize";
type Drag = {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origin: Layout;
};

const DEFAULT_LAYOUT: Layout = { map_x: 30, map_y: 30, map_w: 20, map_h: 16 };

function asLayout(r: Room): Layout {
  return {
    map_x: r.map_x ?? DEFAULT_LAYOUT.map_x,
    map_y: r.map_y ?? DEFAULT_LAYOUT.map_y,
    map_w: r.map_w ?? DEFAULT_LAYOUT.map_w,
    map_h: r.map_h ?? DEFAULT_LAYOUT.map_h,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function RoomsAdmin({ buildings, floors, rooms }: Props) {
  useRealtimeRefresh(REALTIME_TABLES);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const buildingFloors = useMemo(
    () => floors.filter((f) => f.building_id === buildingId),
    [floors, buildingId],
  );
  // floorId는 derived state. 사용자가 마지막에 고른 값이 현재 건물의 층 목록에
  // 없으면(건물 변경, realtime 삭제 등) 자동으로 첫 번째 층으로 fallback.
  // useEffect 안 setState로 처리하면 한 프레임 깜빡이고 react-hooks/set-state-in-effect 위반.
  const [floorIdState, setFloorId] = useState<string>("");
  const floorId =
    buildingFloors.find((f) => f.id === floorIdState)?.id
    ?? buildingFloors[0]?.id
    ?? "";

  const visibleRooms = useMemo(
    () => rooms.filter((r) => r.floor_id === floorId && r.active),
    [rooms, floorId],
  );

  // 드래그 중인 박스의 임시 레이아웃 (서버 응답 도착 전 부드럽게 보이도록)
  const [overrides, setOverrides] = useState<Record<string, Layout>>({});
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // 이름 편집 중에 다른 박스/캔버스를 만지면 편집 폼을 빨강 + 0.45s 흔들림으로
  // "다른 액션은 안 먹힘" 신호를 준다. PIN 오답 패턴과 동일.
  const [shakeNonce, setShakeNonce] = useState(0);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpShake = () => {
    setShakeNonce((n) => n + 1);
    setShaking(true);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShaking(false), 450);
  };

  function startDrag(e: React.PointerEvent, room: Room, mode: DragMode) {
    if (editingId) {
      // 편집 중인 박스 자기 자신이 아닌 다른 박스를 건드린 경우만 흔들림
      if (editingId !== room.id) bumpShake();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: room.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: overrides[room.id] ?? asLayout(room),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;

    let next: Layout;
    if (drag.mode === "move") {
      next = {
        ...drag.origin,
        map_x: clamp(drag.origin.map_x + dxPct, 0, 100 - drag.origin.map_w),
        map_y: clamp(drag.origin.map_y + dyPct, 0, 100 - drag.origin.map_h),
      };
    } else {
      next = {
        ...drag.origin,
        map_w: clamp(drag.origin.map_w + dxPct, 5, 100 - drag.origin.map_x),
        map_h: clamp(drag.origin.map_h + dyPct, 5, 100 - drag.origin.map_y),
      };
    }
    setOverrides((prev) => ({ ...prev, [drag.id]: next }));
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const next = overrides[drag.id];
    if (!next) return;
    startTransition(async () => {
      await updateRoomLayout(drag.id, next);
    });
  }

  function handleAdd() {
    if (!floorId) return;
    startTransition(async () => {
      await createRoom(floorId);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("이 호실을 삭제하시겠어요? (예약 이력이 있으면 비활성화됩니다)")) return;
    startTransition(async () => {
      await deleteRoom(id);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  }

  function handleRename(id: string, name: string) {
    startTransition(async () => {
      await updateRoomMeta(id, { name });
    });
    setEditingId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      {/* 좌측: 건물/층 트리 */}
      <aside className="space-y-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">건물</h3>
          <div className="flex flex-col gap-1">
            {buildings.map((b) => (
              <button
                key={b.id}
                onClick={() => setBuildingId(b.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  buildingId === b.id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-stone-200 bg-white hover:bg-stone-50",
                )}
              >
                {b.name}
              </button>
            ))}
            {buildings.length === 0 && (
              <p className="text-sm text-stone-500">
                먼저 Supabase Studio에서 건물을 추가해주세요.
              </p>
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">층</h3>
          <div className="flex flex-col gap-1">
            {buildingFloors.map((f) => (
              <button
                key={f.id}
                onClick={() => setFloorId(f.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  floorId === f.id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-stone-200 bg-white hover:bg-stone-50",
                )}
              >
                {f.label}
              </button>
            ))}
            {buildingFloors.length === 0 && buildings.length > 0 && (
              <p className="text-sm text-stone-500">
                층이 없습니다. Supabase Studio에서 추가해주세요.
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* 메인: 캔버스 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-stone-600">
            박스를 드래그하면 위치가, 우하단 모서리를 드래그하면 크기가 조정됩니다.
            더블클릭하면 이름을 편집할 수 있습니다.
          </div>
          <button
            onClick={handleAdd}
            disabled={!floorId || isPending}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Plus className="h-4 w-4" />
            호실 추가
          </button>
        </div>

        <div
          ref={canvasRef}
          onPointerDown={(e) => {
            // 편집 중에 빈 캔버스를 누른 경우만 — 박스를 누른 경우는 startDrag 가 처리
            if (editingId && e.target === e.currentTarget) bumpShake();
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative w-full select-none rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50"
          style={{ aspectRatio: "16 / 10" }}
        >
          {visibleRooms.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
              {floorId
                ? "+ 호실 추가 버튼으로 호실을 만들어주세요"
                : "건물과 층을 먼저 선택해주세요"}
            </div>
          )}
          {visibleRooms.map((r) => {
            const layout = overrides[r.id] ?? asLayout(r);
            const style: CSSProperties = {
              left: `${layout.map_x}%`,
              top: `${layout.map_y}%`,
              width: `${layout.map_w}%`,
              height: `${layout.map_h}%`,
            };
            const isEditing = editingId === r.id;
            return (
              <div
                key={r.id}
                style={style}
                className={cn(
                  "absolute flex flex-col rounded-xl border-2 border-brand-500 bg-white/95 shadow-sm",
                  !isEditing && "cursor-move",
                )}
                onPointerDown={(e) => !isEditing && startDrag(e, r, "move")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(r.id);
                }}
              >
                {/* 우상단 삭제 */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleDelete(r.id)}
                  className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-500 shadow-sm hover:border-red-400 hover:text-red-600"
                  aria-label="호실 삭제"
                >
                  <Trash2 className="h-3 w-3" />
                </button>

                {/* 본문 */}
                <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center">
                  {isEditing ? (
                    <RoomNameForm
                      initial={r.name}
                      shakeNonce={shakeNonce}
                      shaking={shaking}
                      onSubmit={(v) => handleRename(r.id, v)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <span className="line-clamp-2 text-sm font-bold text-stone-800">
                      {r.name}
                    </span>
                  )}
                </div>

                {/* 우하단 리사이즈 핸들 */}
                {!isEditing && (
                  <div
                    onPointerDown={(e) => startDrag(e, r, "resize")}
                    className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-xl bg-brand-500/40 hover:bg-brand-500/70"
                    style={{
                      clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                    aria-label="크기 조정"
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RoomNameForm({
  initial,
  shakeNonce,
  shaking,
  onSubmit,
  onCancel,
}: {
  initial: string;
  // 부모가 trigger 마다 증가시키는 카운터. key 로 사용해 form remount → CSS shake 재생.
  shakeNonce: number;
  // 부모가 0.45s 동안 true 로 잡아 빨간 강조 유지.
  shaking: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      key={shakeNonce}
      className={cn(
        "flex w-full flex-col gap-1",
        shaking && "animate-shake",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className={cn(
          "w-full rounded border px-1.5 py-1 text-center text-sm transition-colors",
          shaking
            ? "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-300"
            : "border-stone-300",
        )}
      />
      <div className="flex justify-center gap-1 text-xs">
        <button
          type="submit"
          className="rounded bg-brand-600 px-2 py-0.5 text-white hover:bg-brand-700"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-2 py-0.5 text-stone-700 hover:bg-stone-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
