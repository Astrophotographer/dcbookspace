"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck, Clock, Pin } from "lucide-react";
import { fetchRoomAvailability, type ExistingSlot } from "./availability";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  roomId: string;
  date: string;
  /** 사용자가 입력한 시작 시간 (HH:MM). 없거나 형식 오류면 정보용으로 모든 일정 노출 */
  startTime?: string;
  /** 사용자가 입력한 종료 시간 (HH:MM) */
  endTime?: string;
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
}: Props) {
  const isValid = !!roomId && /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!isValid) return null;
  return (
    <AvailabilityPreviewInner
      roomId={roomId}
      date={date}
      startTime={startTime}
      endTime={endTime}
    />
  );
}

function AvailabilityPreviewInner({ roomId, date, startTime, endTime }: Props) {
  const [slots, setSlots] = useState<ExistingSlot[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // 입력 변경 후 300ms 디바운스 — 빠르게 타이핑할 때 매번 RPC 안 때림
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await fetchRoomAvailability(roomId, date);
        setSlots(r);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [roomId, date]);

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

  // 사용자 시간과 실제 겹침 계산. Date.parse 로 비교 (KST 오프셋 그대로).
  const userStartIso = `${date}T${startTime}:00+09:00`;
  const userEndIso = `${date}T${endTime}:00+09:00`;
  const userStartMs = Date.parse(userStartIso);
  const userEndMs = Date.parse(userEndIso);

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
    const sStart = Date.parse(s.start_at);
    const sEnd = Date.parse(s.end_at);
    if (!Number.isFinite(sStart) || !Number.isFinite(sEnd)) return false;
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
              {formatTime(s.start_at)}–{formatTime(s.end_at)}
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
