"use client";

import { useEffect, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { CalendarCheck, Clock, Pin } from "lucide-react";
import { fetchRoomAvailability, type ExistingSlot } from "./availability";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 슬롯 시간 표시. 시작·종료가 같은 날이면 "HH:mm-HH:mm",
 * 다른 날이면 "YYYY/MM/DD HH:mm – YYYY/MM/DD HH:mm" 으로 — 다일 예약이 같은 날처럼
 * 잘못 보이는 것을 방지.
 */
function formatSlotRange(start_at: string, end_at: string): string {
  const s = parseISO(start_at);
  const e = parseISO(end_at);
  const sameDay = format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd");
  if (sameDay) return `${format(s, "HH:mm")}–${format(e, "HH:mm")}`;
  return `${format(s, "yyyy/MM/dd HH:mm")} – ${format(e, "yyyy/MM/dd HH:mm")}`;
}

type Props = {
  roomId: string;
  date: string;
  /** 사용자가 입력한 시작 시간 (HH:MM). 없거나 형식 오류면 정보용으로 모든 일정 노출 */
  startTime?: string;
  /** 사용자가 입력한 종료 시간 (HH:MM) */
  endTime?: string;
  /** 수정 모드 — 자기 자신을 충돌 후보에서 제외 */
  excludeReservationId?: string;
  excludeSeriesId?: string;
};

const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * 신청 폼에서 호실+날짜+시간이 정해지는 순간 그 시간대와 **겹치는** 일정만
 * 골라 미리 보여준다. 사용자가 시간을 바꾸면 즉시 갱신.
 *
 * 입력 모드 분기:
 *   - 시간이 모두 유효: 겹치는 일정 0건 → 초록 "사용 가능", 1건+ → amber "겹침" + 충돌 목록
 *   - 시간이 비었거나 형식 오류: 정보용으로 그날 잡힌 일정 모두 표시 (사용자 안내)
 *
 * 입력값 무효(roomId 없음 / date 형식 오류) → 패널 자체 미노출.
 * setState-in-effect 룰 회피: 무효 → null 반환으로 inner 컴포넌트가 unmount.
 */
export function AvailabilityPreview({
  roomId,
  date,
  startTime,
  endTime,
  excludeReservationId,
  excludeSeriesId,
}: Props) {
  const isValid = !!roomId && /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!isValid) return null;
  return (
    <AvailabilityPreviewInner
      roomId={roomId}
      date={date}
      startTime={startTime}
      endTime={endTime}
      excludeReservationId={excludeReservationId}
      excludeSeriesId={excludeSeriesId}
    />
  );
}

function AvailabilityPreviewInner({
  roomId,
  date,
  startTime,
  endTime,
  excludeReservationId,
  excludeSeriesId,
}: Props) {
  const [slots, setSlots] = useState<ExistingSlot[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // 입력 변경 후 300ms 디바운스 — 빠르게 타이핑할 때 매번 RPC 안 때림
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await fetchRoomAvailability(roomId, date, {
          excludeReservationId,
          excludeSeriesId,
        });
        setSlots(r);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [roomId, date, excludeReservationId, excludeSeriesId]);

  if (slots === null) {
    return (
      <div
        className={cn(
          "rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500 transition-opacity",
          pending && "animate-pulse",
        )}
      >
        선택한 호실의 그 날 일정 확인 중…
      </div>
    );
  }

  // 사용자가 시간을 다 입력했는지 체크
  const hasUserTime =
    !!startTime &&
    !!endTime &&
    TIME_RE.test(startTime) &&
    TIME_RE.test(endTime);

  if (!hasUserTime) {
    // 시간 미입력 — 정보용 패널 (그날 모든 일정)
    if (slots.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CalendarCheck className="h-4 w-4 flex-none" aria-hidden />
          <span>
            이 호실은 <strong>{date}</strong> 에 등록된 일정이 없습니다 —
            자유롭게 시간대 선택 가능
          </span>
        </div>
      );
    }
    return <SlotListCard slots={slots} date={date} mode="info" />;
  }

  // 사용자 시간과 실제 겹침 계산. parseISO 로 ISO 8601 strict parse.
  const userStartMs = parseISO(`${date}T${startTime}:00+09:00`).getTime();
  const userEndMs = parseISO(`${date}T${endTime}:00+09:00`).getTime();

  // 종료가 시작보다 빠르거나 같음 → 사용자 입력 자체가 잘못됨. 정보 모드로 fallback.
  if (
    !Number.isFinite(userStartMs) ||
    !Number.isFinite(userEndMs) ||
    userEndMs <= userStartMs
  ) {
    if (slots.length === 0) return null;
    return <SlotListCard slots={slots} date={date} mode="info" />;
  }

  const overlapping = slots.filter((s) => {
    const sStart = parseISO(s.start_at).getTime();
    const sEnd = parseISO(s.end_at).getTime();
    if (!Number.isFinite(sStart) || !Number.isFinite(sEnd)) return false;
    // [start, end) 반열린 구간 — 끝-시작 정확히 같으면 안 겹침
    return sStart < userEndMs && sEnd > userStartMs;
  });

  if (overlapping.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <CalendarCheck className="h-4 w-4 flex-none" aria-hidden />
        <span>
          선택하신 시간({startTime}–{endTime})은{" "}
          <strong>겹치는 일정 없이 사용 가능</strong>합니다
        </span>
      </div>
    );
  }

  return <SlotListCard slots={overlapping} date={date} mode="conflict" userRange={`${startTime}–${endTime}`} />;
}

function SlotListCard({
  slots,
  date,
  mode,
  userRange,
}: {
  slots: ExistingSlot[];
  date: string;
  mode: "info" | "conflict";
  userRange?: string;
}) {
  const isConflict = mode === "conflict";
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        isConflict
          ? "border-red-300 bg-red-50"
          : "border-amber-300 bg-amber-50",
      )}
    >
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1.5 font-semibold",
          isConflict ? "text-red-900" : "text-amber-900",
        )}
      >
        <Clock className="h-4 w-4 flex-none" aria-hidden />
        <span>
          {isConflict ? (
            <>
              선택하신 시간(<strong>{userRange}</strong>)과 겹치는 일정이
              있습니다
            </>
          ) : (
            <>
              이 호실은 <strong>{date}</strong> 에 다음 시간대가 잡혀
              있습니다
            </>
          )}
        </span>
      </div>
      <ul className="space-y-1 pl-1">
        {slots.map((s) => (
          <li
            key={`${s.is_fixed ? "f" : "r"}-${s.id}`}
            className="flex items-center gap-2 text-stone-800"
          >
            <span className="font-mono text-xs tabular-nums text-stone-700">
              {formatSlotRange(s.start_at, s.end_at)}
            </span>
            <span className="text-stone-700">{s.label}</span>
            {s.is_fixed && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                <Pin className="h-2.5 w-2.5" aria-hidden />
                고정
              </span>
            )}
            {s.is_recurring && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                정기
              </span>
            )}
            {s.status === "pending" && (
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                결재중
              </span>
            )}
          </li>
        ))}
      </ul>
      {isConflict ? (
        <div className="mt-2 text-xs text-red-700">
          시간을 바꿔서 겹치지 않게 해 주세요. 그래도 강제 진행하면 행사 당일
          충돌 위험이 있습니다.
        </div>
      ) : (
        <div className="mt-2 text-xs text-amber-700">
          위 시간대를 피해 입력해 주세요.
        </div>
      )}
    </div>
  );
}
