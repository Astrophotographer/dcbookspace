"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReservation, forceReserve } from "../actions";

type Props = {
  reservationId: string;
  canForce: boolean;
};

export function AdminActions({ reservationId, canForce }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<"delete" | "force" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(null);
    setError(null);
  }

  function confirmAction() {
    setError(null);
    startTransition(async () => {
      if (open === "delete") {
        const res = await deleteReservation(reservationId);
        if (res.error) setError(res.error);
        else router.push("/admin/reservations");
      } else if (open === "force") {
        const res = await forceReserve(reservationId);
        if (res.error) setError(res.error);
        else {
          router.refresh();
          setOpen(null);
        }
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {canForce && (
          <Button
            size="lg"
            variant="primary"
            onClick={() => setOpen("force")}
          >
            <CheckCircle2 className="h-5 w-5" />
            강제 예약
          </Button>
        )}
        <Button
          size="lg"
          variant="danger"
          onClick={() => setOpen("delete")}
        >
          <Trash2 className="h-5 w-5" />
          신청서 삭제
        </Button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-xl font-bold text-stone-900">
              {open === "delete" ? "신청서 삭제" : "강제 예약"}
            </h2>
            <p className="mb-2 text-base text-stone-800">
              {open === "delete"
                ? "정말 이 신청서를 삭제하시겠습니까?"
                : "결재 단계 없이 즉시 예약 완료 처리하시겠습니까?"}
            </p>
            <p className="mb-5 text-sm text-stone-500">
              {open === "delete"
                ? "삭제 후 복구할 수 없습니다. 결재 이력도 함께 사라집니다."
                : "미처리 결재 단계는 '건너뜀'으로 기록되고 신청 상태가 예약완료로 바뀝니다."}
            </p>

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                size="lg"
                variant="secondary"
                onClick={close}
                disabled={pending}
              >
                아니오
              </Button>
              <Button
                size="lg"
                variant={open === "delete" ? "danger" : "primary"}
                onClick={confirmAction}
                disabled={pending}
              >
                {pending
                  ? "처리 중..."
                  : open === "delete"
                    ? "삭제 확정"
                    : "예약 확정"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
