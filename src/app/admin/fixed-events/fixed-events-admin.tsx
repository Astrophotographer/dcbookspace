"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type {
  Building,
  FixedEvent,
  Floor,
  Room,
} from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createFixedEvent,
  deleteFixedEvent,
  toggleFixedEventActive,
  updateFixedEvent,
} from "./actions";

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
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<FixedEvent | null>(null);

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

  return (
    <div className="space-y-6">
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
        <h2 className="border-b border-stone-200 p-5 text-lg font-semibold">
          요일별 고정 행사 ({events.length})
        </h2>
        {events.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            등록된 고정 행사가 없습니다.
          </div>
        ) : (
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
                      <li
                        key={e.id}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2",
                          e.active
                            ? "border-stone-200"
                            : "border-stone-200 bg-stone-50 opacity-60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold text-stone-800">
                              {shortTime(e.start_time)}–{shortTime(e.end_time)}
                            </span>
                            <span className="font-medium text-stone-900">
                              {e.name}
                            </span>
                            {!e.active && (
                              <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-700">
                                비활성
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-stone-600">
                            {roomLabel(e.room_id, rooms, floors, buildings)}
                            {e.effective_until && (
                              <span className="ml-2 text-xs text-stone-500">
                                · {e.effective_from} ~ {e.effective_until}
                              </span>
                            )}
                          </div>
                          {e.notes && (
                            <div className="mt-0.5 text-xs text-stone-500">
                              {e.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
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
                              });
                            }}
                          >
                            {e.active ? "비활성" : "활성"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditing(e)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (
                                !confirm(
                                  `"${e.name}" 고정 행사를 삭제할까요?`,
                                )
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
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
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
