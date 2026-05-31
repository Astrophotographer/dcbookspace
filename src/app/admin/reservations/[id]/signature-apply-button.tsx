"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyReservationSignatures,
  clearReservationSignatures,
} from "../actions";

type Props = {
  reservationId: string;
  enabled: boolean;
  savedAt: string | null;
  outsideDeptConfirmRequired?: boolean;
};

export function SignatureApplyButton({
  reservationId,
  enabled,
  savedAt,
  outsideDeptConfirmRequired = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const signed = Boolean(savedAt);
  const canClick = signed || enabled;

  function handleClick() {
    setError(null);
    if (signed) {
      startTransition(async () => {
        const res = await clearReservationSignatures(reservationId);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      });
      return;
    }

    if (
      outsideDeptConfirmRequired &&
      !confirm("담당부서가 아닌데도 확인하시겠습니까?")
    ) {
      return;
    }
    startTransition(async () => {
      const res = await applyReservationSignatures(reservationId, {
        confirmOutsideDept: outsideDeptConfirmRequired,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            지도장로 확인
          </h2>
          <p
            className={cn(
              "mt-1 text-sm",
              signed ? "font-medium text-red-600" : "text-stone-500",
            )}
          >
            {signed
              ? "취소하려면 다시한번 버튼을 눌러주세요"
              : enabled
                ? "부서장과 지도장로 사인이 모두 준비되었습니다."
                : "사인관리에서 부서장과 지도장로 사인을 먼저 등록해 주세요."}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canClick || pending}
          onClick={handleClick}
          className={cn(
            "w-full whitespace-nowrap sm:w-auto",
            signed &&
              "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500",
          )}
        >
          {signed ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <FileSignature className="h-5 w-5" />
          )}
          {pending
            ? signed
              ? "취소 중..."
              : "저장 중..."
            : signed
              ? "사인넣기 완료"
              : "사인 넣기"}
        </Button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
