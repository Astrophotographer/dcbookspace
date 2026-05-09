"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrintStatus } from "@/lib/supabase/types";

const COUNTDOWN_SECONDS = 10;

type Props = {
  printStatus: PrintStatus;
};

/**
 * 키오스크 모드(/apply?kiosk=1) 에서 신청 완료 후 신청 폼 복귀 안내.
 *
 *   - 'completed' (정상 출력 완료): emerald 카드 + 10초 카운트다운 + 즉시 버튼
 *   - 'failed'    (인쇄 실패):       amber 카드 + 카운트다운 X + "다시 신청하기" 버튼만
 *                                     (운영자 인지 시간 + 사용자 escape hatch 동시 확보)
 *   - 'requested' / 'printing':       카드 미노출 (인쇄 진행 카드만 보고 대기)
 *
 * 'failed' 에서도 버튼을 노출하는 이유: 키오스크 헤더엔 네비 GUI 가 없어
 * 사용자가 직접 신청 폼으로 돌아갈 길이 없음. 카운트다운만 빼고 버튼은 유지.
 */
export function KioskAutoReturn({ printStatus }: Props) {
  if (printStatus === "completed") return <CompletedCard />;
  if (printStatus === "failed") return <FailedCard />;
  return null;
}

function CompletedCard() {
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

function FailedCard() {
  const router = useRouter();
  return (
    <section className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-300">
          <AlertTriangle
            className="h-8 w-8 text-amber-700"
            strokeWidth={2.2}
            aria-hidden
          />
        </div>
        <div className="flex-1">
          <div className="text-lg font-semibold text-amber-900">
            인쇄에 문제가 있습니다
          </div>
          <div className="mt-1 text-sm text-amber-800">
            사무실 직원에게 알려주세요. 그 사이 다른 신청서를 작성하시려면
            아래 버튼을 눌러 주세요.
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.push("/apply?kiosk=1")}
          className="w-full sm:w-auto"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          다시 신청하기
        </Button>
      </div>
    </section>
  );
}
