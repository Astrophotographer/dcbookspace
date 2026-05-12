"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type {
  Building,
  FixedEvent,
  Floor,
  Room,
} from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import {
  bulkImportFixedEvents,
  createFixedEvent,
  deleteFixedEvent,
  toggleFixedEventActive,
  updateFixedEvent,
} from "./actions";

const BULK_EXAMPLE_FIXED = `요일,시간,행사명,건물,층,호실
일요일,10:00-12:00,유치 1부,교육관,5층,유치부 예배실
일요일,13:00-14:30,유치 2부,교육관,5층,유치부 예배실
수요일,19:30-21:00,수요예배,본당,1층,예배실`;

const BULK_COLUMNS_FIXED = [
  { name: "요일", required: true, help: "일요일·월요일… 또는 일·월…" },
  { name: "시간", required: true, help: "예: 10:00-12:00 (-, –, ~ 모두 허용)" },
  { name: "행사명", required: true, help: "고정 행사 이름" },
  { name: "건물", required: true, help: "기존 건물 이름과 정확히 일치" },
  { name: "층", required: true, help: "기존 층 라벨과 정확히 일치 (예: 5층)" },
  { name: "호실", required: true, help: "기존 호실 이름과 정확히 일치" },
  { name: "시작일", required: false, help: "YYYY-MM-DD (비우면 오늘)" },
  { name: "종료일", required: false, help: "YYYY-MM-DD (비우면 영구)" },
  { name: "비고", required: false, help: "메모" },
];

type Props = {
  initialEvents: FixedEvent[];
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
};

const WEEKDAYS = [
  { value: 0, label: "일요일" },
  { value: 1, label: "월요일" },
  { value: 2, label: "화요일" },
  { value: 3, label: "수요일" },
  { value: 4, label: "목요일" },
  { value: 5, label: "금요일" },
  { value: 6, label: "토요일" },
] as const;

// time string "HH:MM:SS" → "HH:MM"
function shortTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function roomLabel(
  roomId: string,
  rooms: Room[],
  floors: Floor[],
  buildings: Building[],
): string {
  const r = rooms.find((x) => x.id === roomId);
  if (!r) return "(삭제된 호실)";
  const f = floors.find((x) => x.id === r.floor_id);
  const b = f ? buildings.find((x) => x.id === f.building_id) : undefined;
  return [b?.name, f?.label, r.name].filter(Boolean).join(" ");
}

export function FixedEventsAdmin({
  initialEvents,
  buildings,
  floors,
  rooms,
}: Props) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<FixedEvent | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // 두 가지 그룹 view: 요일별 (기본) / 장소별
  const [groupBy, setGroupBy] = useState<"weekday" | "room">("weekday");

  const eventsByDow = useMemo(() => {
    const m = new Map<number, FixedEvent[]>();
    for (const e of events) {
      const arr = m.get(e.weekday) ?? [];
      arr.push(e);
      m.set(e.weekday, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.display_order !== b.display_order)
          return a.display_order - b.display_order;
        return a.start_time.localeCompare(b.start_time);
      });
    }
    return m;
  }, [events]);

  // 장소별 그룹 — 호실 표시 순서(건물→층→호실 display_order)로 정렬.
  // 각 호실 안에선 요일·시작시간 순.
  const groupedByRoom = useMemo(() => {
    const m = new Map<string, FixedEvent[]>();
    for (const e of events) {
      const arr = m.get(e.room_id) ?? [];
      arr.push(e);
      m.set(e.room_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.weekday !== b.weekday) return a.weekday - b.weekday;
        return a.start_time.localeCompare(b.start_time);
      });
    }
    const roomOrder = (a: string, b: string) => {
      const ra = rooms.find((r) => r.id === a);
      const rb = rooms.find((r) => r.id === b);
      if (!ra || !rb) return 0;
      const fa = floors.find((f) => f.id === ra.floor_id);
      const fb = floors.find((f) => f.id === rb.floor_id);
      const ba = fa ? buildings.find((x) => x.id === fa.building_id) : undefined;
      const bb = fb ? buildings.find((x) => x.id === fb.building_id) : undefined;
      if (ba && bb && ba.display_order !== bb.display_order)
        return ba.display_order - bb.display_order;
      if (fa && fb && fa.display_order !== fb.display_order)
        return fa.display_order - fb.display_order;
      return ra.display_order - rb.display_order;
    };
    return Array.from(m.entries()).sort(([a], [b]) => roomOrder(a, b));
  }, [events, rooms, floors, buildings]);

  return (
    <div className="space-y-6">
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
        title="고정 행사 일괄 추가"
        description="여러 행사를 한 번에 등록합니다. 한 줄이라도 오류가 있으면 전부 저장되지 않습니다."
        example={BULK_EXAMPLE_FIXED}
        columns={BULK_COLUMNS_FIXED}
        onSubmit={bulkImportFixedEvents}
        onSaved={() => router.refresh()}
      />

      <FixedEventForm
        buildings={buildings}
        floors={floors}
        rooms={rooms}
        editing={editing}
        pending={pending}
        onCancelEdit={() => setEditing(null)}
        onSubmit={(fd) => {
          setError(null);
          startTransition(async () => {
            if (editing) {
              const res = await updateFixedEvent(editing.id, fd);
              if (res.error) {
                setError(res.error);
                return;
              }
              // 단순화: 서버가 update 한 결과 다시 끌어오기보단 클라이언트에서 폼 값으로 머지
              setEvents((arr) =>
                arr.map((x) =>
                  x.id === editing.id
                    ? mergeFromForm(x, fd)
                    : x,
                ),
              );
              setEditing(null);
            } else {
              const res = await createFixedEvent(fd);
              if (res.error) {
                setError(res.error);
                return;
              }
              if (res.event) setEvents((arr) => [...arr, res.event!]);
            }
          });
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-5">
          <h2 className="text-lg font-semibold">
            고정 행사 ({events.length})
          </h2>
          {/* 그룹 view 토글 — 요일별 / 장소별. localStorage 안 쓰고 메모리만:
              세션 내에서만 유효. 새로고침 시 기본 "요일별" 로 복귀. */}
          <div className="inline-flex rounded-lg bg-stone-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setGroupBy("weekday")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                groupBy === "weekday"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900",
              )}
            >
              요일별
            </button>
            <button
              type="button"
              onClick={() => setGroupBy("room")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                groupBy === "room"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900",
              )}
            >
              장소별
            </button>
          </div>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            등록된 고정 행사가 없습니다.
          </div>
        ) : groupBy === "weekday" ? (
          <div className="divide-y divide-stone-100">
            {WEEKDAYS.map((wd) => {
              const list = eventsByDow.get(wd.value) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={wd.value} className="p-4">
                  <div className="mb-2 text-sm font-semibold text-stone-700">
                    {wd.label}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        secondary={
                          <>
                            {roomLabel(e.room_id, rooms, floors, buildings)}
                            {e.effective_until && (
                              <span className="ml-2 text-xs text-stone-500">
                                · {e.effective_from} ~ {e.effective_until}
                              </span>
                            )}
                          </>
                        }
                        onToggleActive={() =>
                          startTransition(async () => {
                            const res = await toggleFixedEventActive(
                              e.id,
                              !e.active,
                            );
                            if (res.error) setError(res.error);
                            else
                              setEvents((arr) =>
                                arr.map((x) =>
                                  x.id === e.id
                                    ? { ...x, active: !e.active }
                                    : x,
                                ),
                              );
                          })
                        }
                        onEdit={() => setEditing(e)}
                        onDelete={() => {
                          if (
                            !confirm(`"${e.name}" 고정 행사를 삭제할까요?`)
                          )
                            return;
                          startTransition(async () => {
                            const res = await deleteFixedEvent(e.id);
                            if (res.error) setError(res.error);
                            else
                              setEvents((arr) =>
                                arr.filter((x) => x.id !== e.id),
                              );
                          });
                        }}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {groupedByRoom.map(([roomId, list]) => (
              <div key={roomId} className="p-4">
                <div className="mb-2 text-sm font-semibold text-stone-700">
                  {roomLabel(roomId, rooms, floors, buildings)}
                </div>
                <ul className="space-y-1.5">
                  {list.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      secondary={
                        <>
                          {WEEKDAYS.find((w) => w.value === e.weekday)?.label}
                          {e.effective_until && (
                            <span className="ml-2 text-xs text-stone-500">
                              · {e.effective_from} ~ {e.effective_until}
                            </span>
                          )}
                        </>
                      }
                      onToggleActive={() =>
                        startTransition(async () => {
                          const res = await toggleFixedEventActive(
                            e.id,
                            !e.active,
                          );
                          if (res.error) setError(res.error);
                          else
                            setEvents((arr) =>
                              arr.map((x) =>
                                x.id === e.id
                                  ? { ...x, active: !e.active }
                                  : x,
                              ),
                            );
                        })
                      }
                      onEdit={() => setEditing(e)}
                      onDelete={() => {
                        if (!confirm(`"${e.name}" 고정 행사를 삭제할까요?`))
                          return;
                        startTransition(async () => {
                          const res = await deleteFixedEvent(e.id);
                          if (res.error) setError(res.error);
                          else
                            setEvents((arr) =>
                              arr.filter((x) => x.id !== e.id),
                            );
                        });
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * 단일 행사 행. 그룹 헤더(요일 or 장소) 가 위에 있어서, 행 안엔 "다른 축"
 * 정보를 secondary 슬롯으로 채워 넣는다 (요일별 view 면 장소, 장소별 view 면 요일).
 */
function EventRow({
  event,
  secondary,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  event: FixedEvent;
  secondary: React.ReactNode;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2",
        event.active
          ? "border-stone-200"
          : "border-stone-200 bg-stone-50 opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-stone-800">
            {shortTime(event.start_time)}–{shortTime(event.end_time)}
          </span>
          <span className="font-medium text-stone-900">{event.name}</span>
          {!event.active && (
            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-700">
              비활성
            </span>
          )}
        </div>
        <div className="text-sm text-stone-600">{secondary}</div>
        {event.notes && (
          <div className="mt-0.5 text-xs text-stone-500">{event.notes}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={onToggleActive}>
          {event.active ? "비활성" : "활성"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          수정
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          삭제
        </Button>
      </div>
    </li>
  );
}

function mergeFromForm(prev: FixedEvent, fd: FormData): FixedEvent {
  const start = String(fd.get("start_time") ?? prev.start_time);
  const end = String(fd.get("end_time") ?? prev.end_time);
  return {
    ...prev,
    name: String(fd.get("name") ?? prev.name).trim(),
    room_id: String(fd.get("room_id") ?? prev.room_id),
    weekday: parseInt(String(fd.get("weekday") ?? prev.weekday), 10),
    start_time: start.length === 5 ? `${start}:00` : start,
    end_time: end.length === 5 ? `${end}:00` : end,
    effective_from:
      String(fd.get("effective_from") ?? prev.effective_from) ||
      prev.effective_from,
    effective_until: String(fd.get("effective_until") ?? "") || null,
    notes: String(fd.get("notes") ?? "") || null,
  };
}

function FixedEventForm({
  buildings,
  floors,
  rooms,
  editing,
  pending,
  onSubmit,
  onCancelEdit,
}: {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  editing: FixedEvent | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancelEdit: () => void;
}) {
  // 호실 선택을 건물·층 → 호실 3단으로
  const initialBuilding =
    (editing &&
      floors.find((f) => f.id === rooms.find((r) => r.id === editing.room_id)?.floor_id)
        ?.building_id) ??
    buildings[0]?.id ??
    "";
  const initialFloor =
    (editing && rooms.find((r) => r.id === editing.room_id)?.floor_id) ??
    floors.find((f) => f.building_id === initialBuilding)?.id ??
    "";
  const [buildingId, setBuildingId] = useState<string>(initialBuilding);
  const [floorId, setFloorId] = useState<string>(initialFloor);

  // editing 이 바뀌면 form 을 초기화 (key 로 강제 remount)
  return (
    <section
      key={editing?.id ?? "new"}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {editing ? "고정 행사 수정" : "새 고정 행사 추가"}
        </h2>
        {editing && (
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
            새로 추가로 돌아가기
          </Button>
        )}
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const form = e.currentTarget;
          onSubmit(fd);
          if (!editing) form.reset();
        }}
      >
        <Field label="행사 이름">
          <Input
            name="name"
            required
            placeholder="예: 주일 1부 예배"
            defaultValue={editing?.name ?? ""}
          />
        </Field>
        <Field label="요일">
          <Select
            name="weekday"
            required
            defaultValue={String(editing?.weekday ?? 0)}
          >
            {WEEKDAYS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="건물" className="sm:col-span-2">
          <Select
            value={buildingId}
            onChange={(e) => {
              setBuildingId(e.target.value);
              const f = floors.find((x) => x.building_id === e.target.value);
              setFloorId(f?.id ?? "");
            }}
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="층">
          <Select
            value={floorId}
            onChange={(e) => setFloorId(e.target.value)}
          >
            {floors
              .filter((f) => f.building_id === buildingId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="호실">
          <Select
            name="room_id"
            required
            defaultValue={editing?.room_id ?? ""}
          >
            {rooms
              .filter((r) => r.floor_id === floorId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="시작 시간">
          <Input
            type="time"
            name="start_time"
            required
            defaultValue={shortTime(editing?.start_time ?? "09:00:00")}
          />
        </Field>
        <Field label="종료 시간">
          <Input
            type="time"
            name="end_time"
            required
            defaultValue={shortTime(editing?.end_time ?? "10:00:00")}
          />
        </Field>

        <Field
          label="시작일 (선택)"
          hint="이 날짜부터 적용 — 비워두면 오늘부터"
        >
          <Input
            type="date"
            name="effective_from"
            defaultValue={editing?.effective_from ?? ""}
          />
        </Field>
        <Field label="종료일 (선택)" hint="비워두면 영구 반복">
          <Input
            type="date"
            name="effective_until"
            defaultValue={editing?.effective_until ?? ""}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="비고 (선택)">
            <Textarea
              name="notes"
              defaultValue={editing?.notes ?? ""}
              maxLength={300}
            />
          </Field>
        </div>

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {editing ? (
              <>저장</>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                추가
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
