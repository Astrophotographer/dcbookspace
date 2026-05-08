"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrintStatus } from "@/lib/supabase/types";

const COUNTDOWN_SECONDS = 10;

type Props = {
  printStatus: PrintStatus;
};

/**
 * 키오스크 모드(/apply?kiosk=1) 에서 신청 완료 후 자동으로 신청 폼으로 복귀.
 *
 * 트리거: print_status === 'completed' (출력이 정상적으로 끝난 시점)
 *   - 카운트다운 N초 → 끝나면 /apply?kiosk=1 로 이동
 *   - "지금 다시" 버튼으로 즉시 이동
 *   - 'failed' 면 표시 안 함 (운영자 도움 필요)
 *   - 'requested' / 'printing' 동안엔 인쇄 진행 카드만 보고 대기
 *
 * 구현 노트: print_status 가 'completed' 이외면 null 반환 → Inner 컴포넌트가
 * 자동으로 unmount 되며 상태 초기화. 재진입 시 자연스럽게 카운트다운이 새로
 * 시작됨. setState-in-effect 룰을 피하는 방식.
 */
export function KioskAutoReturn({ printStatus }: Props) {
  if (printStatus !== "completed") return null;
  return <ActiveCountdown />;
}

function ActiveCountdown() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.push("/apply?kiosk=1");
      return;
    }
    const t = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, router]);

  return (
    <section className="mb-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 shadow-sm">
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-emerald-100 ring-1 ring-emerald-300">
          <CheckCircle2
            className="h-8 w-8 text-emerald-700"
            strokeWidth={2.2}
            aria-hidden
          />
        </div>
        <div className="flex-1">
          <div className="text-lg font-semibold text-emerald-900">
            출력이 완료되었습니다
          </div>
          <div className="mt-1 text-sm text-emerald-800">
            <strong className="font-bold">{secondsLeft}초</strong> 후 신청서
            화면으로 자동으로 돌아갑니다.
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => router.push("/apply?kiosk=1")}
          className="w-full sm:w-auto"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          지금 다시 신청하기
        </Button>
      </div>
    </section>
  );
}
