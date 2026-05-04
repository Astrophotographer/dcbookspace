"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReservationDetail } from "@/lib/repo";
import { cn, formatTime } from "@/lib/utils";
import { ko } from "date-fns/locale";
import {
  displayStatus,
  STATUS_BADGE_CLASS,
  STATUS_CHIP_CLASS,
  STATUS_LABEL,
} from "@/lib/reservation-status";

type Props = {
  currentDate: string;
  reservations: ReservationDetail[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function DateView({ currentDate, reservations }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const date = parseISO(currentDate);
  const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const today = new Date();

  const goToDate = (target: Date) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("date", format(target, "yyyy-MM-dd"));
    router.push(`?${sp.toString()}`);
  };

  const shiftMonth = (delta: number) => goToDate(addMonths(date, delta));

  // 다일 예약은 시작~종료 사이의 모든 날짜에 칩으로 표시한다.
  // 그리드 밖의 날짜는 어차피 안 보이므로 그리드 범위로 clamp.
  const byDate = new Map<string, ReservationDetail[]>();
  for (const r of reservations) {
    const start = parseISO(r.start_at);
    const end = parseISO(r.end_at);
    const from = maxDate([start, gridStart]);
    const to = minDate([end, gridEnd]);
    if (to < from) continue;
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const key = format(day, "yyyy-MM-dd");
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(r);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-stone-900">
          {format(date, "yyyy년 M월")}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="이전 달"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white hover:bg-stone-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => goToDate(today)}
            className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium hover:bg-stone-50"
          >
            오늘
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="다음 달"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white hover:bg-stone-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-300 bg-stone-300">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={wd}
              className={cn(
                "bg-stone-50 px-2 py-2 text-center text-xs font-semibold",
                i === 0 && "text-red-600",
                i === 6 && "text-blue-600",
                i !== 0 && i !== 6 && "text-stone-700",
              )}
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px border-t border-stone-300">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const list = byDate.get(key) ?? [];
            const inMonth = isSameMonth(day, date);
            const isSelected = isSameDay(day, date);
            const isToday = isSameDay(day, today);
            const dow = day.getDay();

            return (
              <div
                key={key}
                className={cn(
                  "relative flex min-h-28 flex-col bg-white p-1.5",
                  !inMonth && "bg-stone-50/70",
                  isSelected && "ring-2 ring-inset ring-brand-500",
                )}
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => goToDate(day)}
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-sm font-medium transition-colors",
                      isToday
                        ? "bg-brand-600 text-white"
                        : cn(
                            "hover:bg-stone-100",
                            dow === 0 && "text-red-600",
                            dow === 6 && "text-blue-600",
                            dow !== 0 && dow !== 6 && "text-stone-800",
                            !inMonth && "opacity-40",
                          ),
                    )}
                  >
                    {day.getDate()}
                  </button>
                  {list.length > 0 && (
                    <span className="text-[10px] text-stone-500">
                      {list.length}건
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5 overflow-hidden">
                  {list.slice(0, 3).map((r) => {
                    const ds = displayStatus(r);
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/reservations/${r.id}`}
                          title={`[${STATUS_LABEL[ds]}] ${formatTime(r.start_at)}–${formatTime(r.end_at)} · ${r.dept?.name ?? ""} · ${r.purpose}`}
                          className={cn(
                            "block truncate rounded px-1 py-0.5 text-[11px] hover:opacity-80",
                            STATUS_CHIP_CLASS[ds],
                          )}
                        >
                          <span className="font-mono">
                            {formatTime(r.start_at)}
                          </span>{" "}
                          {r.room.name}
                        </Link>
                      </li>
                    );
                  })}
                  {list.length > 3 && (
                    <li className="px-1 text-[10px] text-stone-500">
                      +{list.length - 3}건
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <SelectedDayList
        date={date}
        list={byDate.get(currentDate) ?? []}
      />
    </div>
  );
}

function SelectedDayList({
  date,
  list,
}: {
  date: Date;
  list: ReservationDetail[];
}) {
  const heading = format(date, "yyyy년 M월 d일 (E)", { locale: ko });
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-stone-800">
        {heading} 예약 {list.length}건
      </h3>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
          이 날짜에 신청된 예약이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const ds = displayStatus(r);
            return (
              <li key={r.id}>
                <Link
                  href={`/reservations/${r.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-3 transition-colors hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-stone-600">
                        {formatTime(r.start_at)} – {formatTime(r.end_at)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_BADGE_CLASS[ds],
                        )}
                      >
                        {STATUS_LABEL[ds]}
                      </span>
                    </div>
                    <div className="text-base font-medium text-stone-900">
                      {r.room.floor.building.name} {r.room.floor.label}{" "}
                      {r.room.name}
                    </div>
                    <div className="text-xs text-stone-500">
                      {r.dept?.name ?? "(부서 미지정)"} · {r.purpose}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
