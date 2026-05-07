"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck, Clock, Pin } from "lucide-react";
import { fetchRoomAvailability, type ExistingSlot } from "./availability";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  roomId: string;
  date: string;
};

/**
 * 신청 폼에서 호실+날짜가 정해지는 순간 그 날 이미 잡힌 일정을 inline 으로 보여줘
 * 사용자가 충돌 시간대를 피해 입력할 수 있게 한다.
 *
 * 입력값 무효(roomId 비거나 date 형식 안 맞으면) → 패널 자체 미노출.
 * Inner 컴포넌트로 분리해 무효 → 유효 전환 시 자연스럽게 mount/unmount,
 * setState-in-effect 룰을 피해 상태 초기화는 mount 로 자동 처리.
 */
export function AvailabilityPreview({ roomId, date }: Props) {
  const isValid = !!roomId && /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!isValid) return null;
  return <AvailabilityPreviewInner roomId={roomId} date={date} />;
}

function AvailabilityPreviewInner({ roomId, date }: Props) {
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

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-amber-900">
        <Clock className="h-4 w-4 flex-none" aria-hidden />
        <span>
          이 호실은 <strong>{date}</strong> 에 다음 시간대가 잡혀 있습니다
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
      <div className="mt-2 text-xs text-amber-700">
        위 시간대를 피해 입력해 주세요. 강제 진행도 가능하지만 행사 당일 충돌
        위험이 있습니다.
      </div>
    </div>
  );
}
