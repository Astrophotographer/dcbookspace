"use client";

import { useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import type {
  RoomConflictResult,
  SeriesConflictResult,
  AdminContactInfo,
  ConflictInfo,
  FixedEventConflictInfo,
} from "@/app/apply/actions";

const KOR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 같은 날 안의 충돌이면 시간 범위만, 다른 날에 걸치면 종료 쪽도 날짜 표기
function formatConflictWindow(startIso: string, endIso: string) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const sameDay =
    format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  return {
    date: format(start, "yyyy/MM/dd (E)", { locale: ko }),
    range: sameDay
      ? `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`
      : `${format(start, "HH:mm")} – ${format(end, "yyyy/MM/dd HH:mm", { locale: ko })}`,
  };
}

function shortTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export type ConflictModalData =
  | { kind: "single"; result: RoomConflictResult }
  | { kind: "series"; result: SeriesConflictResult };

type Props = {
  data: ConflictModalData | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConflictModal({ data, pending, onCancel, onConfirm }: Props) {
  // Esc 닫기 + body 스크롤 잠금. 백드롭 클릭은 사고 방지를 위해 닫지 않음 (어르신 기준)
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [data, onCancel]);

  if (!data) return null;
  const adminContact: AdminContactInfo | null = data.result.adminContact;

  // 일회성: empty check
  if (data.kind === "single") {
    if (
      data.result.reservations.length === 0 &&
      data.result.fixedEvents.length === 0
    )
      return null;
  } else {
    if (data.result.occurrences.length === 0) return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      aria-describedby="conflict-modal-desc"
    >
      <div className="animate-modal-overlay absolute inset-0 bg-stone-900/45 backdrop-blur-[2px]" />

      <div className="animate-modal-panel relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-stone-200/80">
        {/* 상단 강조 라인 — 경고색이지만 차분하게 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-amber-500 to-orange-400" />

        <div className="px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200/70">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div className="min-w-0 pt-0.5">
              <h2
                id="conflict-modal-title"
                className="text-2xl font-bold tracking-tight text-stone-900"
              >
                {data.kind === "series"
                  ? `중복되는 회차가 ${data.result.occurrences.length}개 있습니다`
                  : "이미 예약된 시간입니다"}
              </h2>
              <p
                id="conflict-modal-desc"
                className="mt-1 text-base text-stone-600"
              >
                {data.kind === "series"
                  ? "아래 회차·시간대에 이미 잡혀 있어요. 그래도 진행하시면 중복 신청됩니다."
                  : "선택한 호실에 다른 일정이 잡혀 있어요."}
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-5 max-h-[40vh] space-y-2.5 overflow-y-auto px-6 sm:px-8">
          {data.kind === "single"
            ? renderSingleConflicts(
                data.result.fixedEvents,
                data.result.reservations,
              )
            : data.result.occurrences.map((occ) => (
                <li
                  key={`occ-${occ.date}-${occ.blockIndex}`}
                  className="rounded-xl border border-amber-200 bg-amber-50/40 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold text-stone-900">
                      {format(parseISO(occ.date), "yyyy/MM/dd (E)", {
                        locale: ko,
                      })}
                    </span>
                    <span className="font-mono text-stone-700">
                      {format(parseISO(occ.startAt), "HH:mm")} –{" "}
                      {format(parseISO(occ.endAt), "HH:mm")}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {renderSingleConflicts(
                      occ.fixedEvents,
                      occ.reservations,
                      true,
                    )}
                  </ul>
                </li>
              ))}
        </ul>

        <div className="mx-6 mt-5 mb-3 rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-3 leading-relaxed text-amber-900 sm:mx-8">
          <div className="text-base font-semibold">그래도 신청하시겠습니까?</div>
          <div className="mt-1 text-sm">
            진행하시면 위 일정과 <strong className="font-semibold">중복으로 신청</strong>되며,
            이후 관리자가 검토하여 조정할 수 있습니다.
          </div>
        </div>

        {adminContact && (
          <div className="mx-6 mb-6 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900 sm:mx-8 sm:mb-7">
            <div className="font-semibold">반드시 관리자에게 먼저 연락 주세요.</div>
            <div className="mt-1">
              <span className="font-medium">{adminContact.name}</span>
              {adminContact.phone && (
                <span className="ml-2 font-mono">{adminContact.phone}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/60 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onCancel}
            disabled={pending}
          >
            돌아가기
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onConfirm}
            disabled={pending}
            className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
          >
            {pending ? "신청 중..." : "네, 신청합니다"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 일회성 모달 본문 + 시리즈 회차 카드 안의 충돌 항목들을 같은 형태로 그린다. */
function renderSingleConflicts(
  fixedEvents: FixedEventConflictInfo[],
  reservations: ConflictInfo[],
  compact: boolean = false,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  for (const ev of fixedEvents) {
    items.push(
      <li
        key={`fx-${ev.id}-${compact ? "c" : "f"}`}
        className={cn(
          "rounded-xl border border-stone-300 bg-stone-100",
          compact ? "p-2.5" : "p-4",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "font-semibold text-stone-900",
                compact ? "text-sm" : "text-lg",
              )}
            >
              매주 {KOR_WEEKDAYS[ev.weekday]}요일
            </span>
            <span
              className={cn(
                "tabular-nums text-stone-700",
                compact ? "text-sm" : "text-base",
              )}
            >
              {shortTime(ev.start_time)} – {shortTime(ev.end_time)}
            </span>
          </div>
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-800 ring-1 ring-stone-300">
            <span
              className="h-1.5 w-1.5 rounded-full bg-stone-500"
              aria-hidden="true"
            />
            고정 행사
          </span>
        </div>
        <div
          className={cn(
            "truncate text-stone-700",
            compact ? "mt-0.5 text-sm" : "mt-1.5 text-base",
          )}
        >
          {ev.name}
        </div>
      </li>,
    );
  }
  for (const c of reservations) {
    const { date, range } = formatConflictWindow(c.start_at, c.end_at);
    const approved = c.status === "approved";
    const applicantLabel =
      [c.dept?.name, c.applicant?.name].filter(Boolean).join(" · ") || null;
    items.push(
      <li
        key={`r-${c.id}-${compact ? "c" : "f"}`}
        className={cn(
          "rounded-xl border border-stone-200/80 bg-stone-50/70",
          compact ? "p-2.5" : "p-4",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {!compact && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-lg font-semibold text-stone-900">
                {date}
              </span>
              <span className="text-base tabular-nums text-stone-700">
                {range}
              </span>
            </div>
          )}
          {compact && (
            <span className="truncate text-sm font-medium text-stone-700">
              {c.purpose}
            </span>
          )}
          <span
            className={cn(
              "inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              approved
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                approved ? "bg-emerald-500" : "bg-amber-500",
              )}
              aria-hidden="true"
            />
            {approved ? "예약 완료" : "결재 진행중"}
          </span>
        </div>
        {!compact && (
          <div className="mt-1.5 truncate text-base text-stone-700">
            {c.purpose}
          </div>
        )}
        {applicantLabel && (
          <div
            className={cn(
              "truncate text-stone-600",
              compact ? "mt-0.5 text-xs" : "mt-0.5 text-sm",
            )}
          >
            {applicantLabel}
            {c.applicant?.phone && (
              <span className="ml-2 font-mono text-stone-500">
                {c.applicant.phone}
              </span>
            )}
          </div>
        )}
      </li>,
    );
  }
  return items;
}
