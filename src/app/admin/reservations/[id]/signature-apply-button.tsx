"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyReservationSignatures } from "../actions";

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

  function apply() {
    setError(null);
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
          <p className="mt-1 text-sm text-stone-500">
            {enabled
              ? savedAt
                ? "저장된 사인이 출력 서류에 반영되어 있습니다."
                : "부서장과 지도장로 사인이 모두 준비되었습니다."
              : "사인관리에서 부서장과 지도장로 사인을 먼저 등록해 주세요."}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!enabled || pending}
          onClick={apply}
          className="w-full whitespace-nowrap sm:w-auto"
        >
          <FileSignature className="h-5 w-5" />
          {pending
            ? "저장 중..."
            : "신청서확인"}
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
