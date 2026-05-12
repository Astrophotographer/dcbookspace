"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { Building, Floor, Room } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import {
  bulkImportRooms,
  createBuilding,
  createFloor,
  createRoom,
  deleteBuilding,
  deleteFloor,
  deleteRoom,
  renameBuilding,
  renameFloor,
  updateRoomLayout,
  updateRoomMeta,
} from "./actions";

const BULK_EXAMPLE_ROOMS = `건물,층,호실
교육관,5층,유치부 예배실
교육관,5층,영아부 예배실
본당,1층,예배실`;

const BULK_COLUMNS_ROOMS = [
  { name: "건물", required: true, help: "기존 건물이 없으면 자동 생성" },
  { name: "층", required: true, help: "예: 1층 / B1 / 5층. 없으면 자동 생성" },
  { name: "호실", required: true, help: "같은 층에 같은 이름 호실 있으면 거부됨" },
];

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
  const router = useRouter();
  const [bulkOpen, setBulkOpen] = useState(false);
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

  // 건물/층 인라인 편집 — 같은 시점엔 둘 중 하나만 활성
  const [renamingBuildingId, setRenamingBuildingId] = useState<string | null>(null);
  const [renamingFloorId, setRenamingFloorId] = useState<string | null>(null);
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [addingFloor, setAddingFloor] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // === 건물 CRUD ===
  function handleAddBuilding(name: string) {
    setError(null);
    startTransition(async () => {
      const res = await createBuilding(name);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAddingBuilding(false);
      if (res.building) setBuildingId(res.building.id);
    });
  }
  function handleRenameBuilding(id: string, name: string) {
    setError(null);
    startTransition(async () => {
      const res = await renameBuilding(id, name);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRenamingBuildingId(null);
    });
  }
  function handleDeleteBuilding(id: string, name: string) {
    if (
      !confirm(
        `"${name}" 건물을 삭제하시겠어요? 이 건물의 모든 층·호실이 함께 삭제됩니다.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBuilding(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (id === buildingId) {
        const fallback = buildings.find((b) => b.id !== id);
        setBuildingId(fallback?.id ?? "");
      }
    });
  }

  // === 층 CRUD ===
  function handleAddFloor(label: string) {
    if (!buildingId) {
      setError("먼저 건물을 선택해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createFloor(buildingId, label);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAddingFloor(false);
      if (res.floor) setFloorId(res.floor.id);
    });
  }
  function handleRenameFloor(id: string, label: string) {
    setError(null);
    startTransition(async () => {
      const res = await renameFloor(id, label);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRenamingFloorId(null);
    });
  }
  function handleDeleteFloor(id: string, label: string) {
    if (
      !confirm(
        `"${label}" 층을 삭제하시겠어요? 이 층의 모든 호실이 함께 삭제됩니다.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteFloor(id);
      if (res.error) {
        setError(res.error);
        return;
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setBulkOpen(true)}
        >
          <Upload className="h-4 w-4" />
          CSV 일괄 추가
        </Button>
      </div>

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="건물·호실 일괄 추가"
        description="건물·층이 없으면 자동으로 만들고, 그 아래에 호실을 추가합니다. 같은 층에 같은 이름의 호실이 이미 있으면 거부됩니다."
        example={BULK_EXAMPLE_ROOMS}
        columns={BULK_COLUMNS_ROOMS}
        onSubmit={bulkImportRooms}
        onSaved={() => router.refresh()}
      />

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      {/* 좌측: 건물/층 트리 */}
      <aside className="space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">건물</h3>
          <div className="flex flex-col gap-1">
            {buildings.map((b) => (
              <EditableTab
                key={b.id}
                label={b.name}
                active={buildingId === b.id}
                renaming={renamingBuildingId === b.id}
                disabled={isPending}
                onSelect={() => setBuildingId(b.id)}
                onStartRename={() => setRenamingBuildingId(b.id)}
                onCancelRename={() => setRenamingBuildingId(null)}
                onSubmitRename={(v) => handleRenameBuilding(b.id, v)}
                onDelete={() => handleDeleteBuilding(b.id, b.name)}
              />
            ))}
            {addingBuilding ? (
              <InlineCreateForm
                placeholder="새 건물 이름"
                onSubmit={handleAddBuilding}
                onCancel={() => setAddingBuilding(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingBuilding(true)}
                className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
              >
                <Plus className="h-4 w-4" />
                건물 추가
              </button>
            )}
            {buildings.length === 0 && !addingBuilding && (
              <p className="text-sm text-stone-500">
                건물이 없습니다. 위에서 추가해 주세요.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">층</h3>
          <div className="flex flex-col gap-1">
            {buildingFloors.map((f) => (
              <EditableTab
                key={f.id}
                label={f.label}
                active={floorId === f.id}
                renaming={renamingFloorId === f.id}
                disabled={isPending}
                onSelect={() => setFloorId(f.id)}
                onStartRename={() => setRenamingFloorId(f.id)}
                onCancelRename={() => setRenamingFloorId(null)}
                onSubmitRename={(v) => handleRenameFloor(f.id, v)}
                onDelete={() => handleDeleteFloor(f.id, f.label)}
              />
            ))}
            {buildingId && addingFloor ? (
              <InlineCreateForm
                placeholder="예: 3층 / B1 / MF"
                onSubmit={handleAddFloor}
                onCancel={() => setAddingFloor(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingFloor(true)}
                disabled={!buildingId}
                className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                층 추가
              </button>
            )}
            {buildingFloors.length === 0 && buildingId && !addingFloor && (
              <p className="text-sm text-stone-500">
                층이 없습니다. 위에서 추가해 주세요.
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
    </div>
  );
}

/**
 * 건물·층 사이드바의 한 행. 평소엔 선택 버튼 + ✏️/🗑 인라인 아이콘,
 * renaming=true 면 그 자리가 인라인 입력 폼으로 전환된다.
 */
function EditableTab({
  label,
  active,
  renaming,
  disabled,
  onSelect,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDelete,
}: {
  label: string;
  active: boolean;
  renaming: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSubmitRename: (v: string) => void;
  onDelete: () => void;
}) {
  if (renaming) {
    return (
      <InlineRenameForm
        initial={label}
        onSubmit={onSubmitRename}
        onCancel={onCancelRename}
      />
    );
  }
  return (
    <div
      className={cn(
        "group flex items-stretch overflow-hidden rounded-lg border transition-colors",
        active
          ? "border-brand-500 bg-brand-50"
          : "border-stone-200 bg-white hover:bg-stone-50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex-1 px-3 py-2 text-left text-sm",
          active ? "text-brand-700" : "text-stone-800",
        )}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onStartRename}
        disabled={disabled}
        aria-label={`${label} 이름 변경`}
        className="flex w-8 items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`${label} 삭제`}
        className="flex w-8 items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 새 건물/층 추가용 인라인 폼. Enter 저장, Esc 취소. */
function InlineCreateForm({
  placeholder,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-stretch gap-1 rounded-lg border-2 border-brand-300 bg-white p-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSubmit(v);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 rounded px-2 py-1 text-sm focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-brand-600 px-2 text-xs font-medium text-white hover:bg-brand-700"
      >
        저장
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="취소"
        className="flex w-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

/** 건물/층 이름 변경용 인라인 폼. */
function InlineRenameForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex items-stretch gap-1 rounded-lg border-2 border-brand-500 bg-white p-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSubmit(v);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 rounded px-2 py-1 text-sm focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-brand-600 px-2 text-xs font-medium text-white hover:bg-brand-700"
      >
        저장
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="취소"
        className="flex w-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
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
