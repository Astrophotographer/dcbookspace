"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ReservationDetail } from "@/lib/repo";
import type { FixedEventInstance } from "@/lib/recurrence";
import { fixedEventsByDate } from "@/lib/recurrence";
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
  fixedEvents?: FixedEventInstance[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function DateView({
  currentDate,
  reservations,
  fixedEvents = [],
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [modalDate, setModalDate] = useState<Date | null>(null);

  // 그리드는 currentDate 가 속한 주(Sun-Sat) 를 2번째 행에 두고 6주를 펼침
  // (위쪽에 한 주 여유를 둬서 직전 주 일정도 같이 보이게). 그래서 "오늘" 버튼을
  // 누르면 오늘이 자연스럽게 2번째 줄에 자리잡는다.
  // 휠 위/아래 → currentDate 가 ±7일 이동하면서 그리드 전체가 한 주씩 굴러간다.
  const date = parseISO(currentDate);
  const currentWeekStart = startOfWeek(date, { weekStartsOn: 0 });
  const gridStart = addDays(currentWeekStart, -7);
  const gridEnd = addDays(gridStart, 41); // 6주 = 42일 (0~41)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // 헤더 월 라벨은 2번째 줄의 마지막 날(토요일, = currentDate 가 속한 주의 토요일).
  const headerAnchor = addDays(gridStart, 13);

  const today = new Date();

  const goToDate = (target: Date) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("date", format(target, "yyyy-MM-dd"));
    router.push(`?${sp.toString()}`);
  };

  const shiftMonth = (delta: number) => goToDate(addMonths(date, delta));

  // 캘린더 위에서 마우스 휠 → 한 주씩 이동.
  // React onWheel 은 passive 라 preventDefault 가 안 먹어서 native 리스너로 등록.
  // 휠은 빠르게 연발하므로 250ms throttle 로 한 주씩만 넘김.
  const gridRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef(date);
  const paramsRef = useRef(params);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let lastNav = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // 핀치 줌은 무시
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 가로 스크롤 무시
      if (Math.abs(e.deltaY) < 5) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastNav < 250) return;
      lastNav = now;
      const target = addDays(dateRef.current, e.deltaY > 0 ? 7 : -7);
      const sp = new URLSearchParams(paramsRef.current.toString());
      sp.set("date", format(target, "yyyy-MM-dd"));
      router.push(`?${sp.toString()}`);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [router]);

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
  const fixedByDate = fixedEventsByDate(fixedEvents);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-stone-900">
          {format(headerAnchor, "yyyy년 M월")}
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

      <div
        ref={gridRef}
        className="overflow-hidden rounded-2xl border border-stone-300 bg-stone-300"
      >
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={wd}
              className={cn(
                "bg-stone-50 px-1 py-1.5 text-center text-[11px] font-semibold sm:px-2 sm:py-2 sm:text-xs",
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
            const fixedList = fixedByDate.get(key) ?? [];
            const isToday = isSameDay(day, today);
            const dow = day.getDay();
            const month = day.getMonth() + 1; // 1~12
            const isFirstOfMonth = day.getDate() === 1;
            // 새 달이 시작되는 칸은 "M/D" 로 — 한눈에 달 경계가 보이도록.
            const dayLabel = isFirstOfMonth
              ? `${month}/${day.getDate()}`
              : `${day.getDate()}`;
            // 짝수 달은 옅은 주황 배경 → 달 영역이 가로 띠처럼 구분됨.
            const isEvenMonth = month % 2 === 0;

            return (
              <div
                key={key}
                className={cn(
                  "relative flex min-h-20 flex-col p-1 sm:min-h-28 sm:p-1.5",
                  isEvenMonth ? "bg-orange-50" : "bg-white",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => setModalDate(day)}
                    aria-label={`${format(day, "yyyy년 M월 d일")} 예약 ${list.length}건 보기`}
                    className={cn(
                      "inline-flex h-5 items-center justify-center rounded-full px-1.5 text-xs font-medium transition-colors sm:h-6 sm:px-2 sm:text-sm",
                      isToday
                        ? "bg-brand-600 text-white"
                        : cn(
                            "hover:bg-stone-100",
                            isFirstOfMonth && "font-bold text-stone-900",
                            !isFirstOfMonth && dow === 0 && "text-red-600",
                            !isFirstOfMonth && dow === 6 && "text-blue-600",
                            !isFirstOfMonth &&
                              dow !== 0 &&
                              dow !== 6 &&
                              "text-stone-800",
                          ),
                    )}
                  >
                    {dayLabel}
                  </button>
                  {(list.length > 0 || fixedList.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setModalDate(day)}
                      className="hidden text-[10px] text-stone-500 hover:text-stone-800 sm:inline"
                    >
                      {list.length + fixedList.length}건
                    </button>
                  )}
                </div>
                <ul className="mt-0.5 space-y-0.5 overflow-hidden sm:mt-1">
                  {fixedList.slice(0, 2).map((ev) => (
                    <li key={ev.id}>
                      <span
                        title={`[고정] ${ev.name} · ${formatTime(ev.start_at)}–${formatTime(ev.end_at)}`}
                        className="block truncate rounded bg-stone-200 px-0.5 py-0.5 text-[10px] text-stone-800 sm:px-1 sm:text-[11px]"
                      >
                        <span className="font-mono">
                          {formatTime(ev.start_at)}
                        </span>{" "}
                        {ev.name}
                      </span>
                    </li>
                  ))}
                  {list.slice(0, 3).map((r) => {
                    const ds = displayStatus(r);
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/reservations/${r.id}`}
                          title={`[${STATUS_LABEL[ds]}] ${formatTime(r.start_at)}–${formatTime(r.end_at)} · ${r.dept?.name ?? ""} · ${r.purpose}`}
                          className={cn(
                            "block truncate rounded px-0.5 py-0.5 text-[10px] hover:opacity-80 sm:px-1 sm:text-[11px]",
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
                  {list.length + fixedList.length > 5 && (
                    <li className="px-1 text-[10px] text-stone-500">
                      +{list.length + fixedList.length - 5}건
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {modalDate && (
        <DayReservationsModal
          date={modalDate}
          list={byDate.get(format(modalDate, "yyyy-MM-dd")) ?? []}
          fixedList={fixedByDate.get(format(modalDate, "yyyy-MM-dd")) ?? []}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  );
}

function DayReservationsModal({
  date,
  list,
  fixedList,
  onClose,
}: {
  date: Date;
  list: ReservationDetail[];
  fixedList: FixedEventInstance[];
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

  const heading = format(date, "yyyy년 M월 d일 (E)", { locale: ko });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${heading} 예약 목록`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900">{heading}</h2>
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
            <div className="mb-3">
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
                  </li>
                ))}
              </ul>
            </div>
          )}
          {list.length === 0 && fixedList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
              이 날짜에 신청된 예약이 없습니다.
            </div>
          ) : list.length === 0 ? null : (
            <ul className="space-y-2">
              {list.map((r) => {
                const ds = displayStatus(r);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/reservations/${r.id}`}
                      className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-3 transition-colors hover:bg-stone-50"
                    >
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
                      <div className="text-base text-stone-900">
                        <div>
                          {r.room.floor.building.name} {r.room.floor.label}
                        </div>
                        <div className="font-medium">{r.room.name}</div>
                      </div>
                      <div className="text-xs text-stone-500">
                        {r.dept?.name ?? "(부서 미지정)"} · {r.purpose}
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
