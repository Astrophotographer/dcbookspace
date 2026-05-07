"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteReservation,
  forceReject,
  forceReserve,
} from "../actions";

type ActionKind = "force" | "reject" | "delete";

type Props = {
  reservationId: string;
  /** 강제 예약·반려 가능 여부 (status === 'pending' 일 때만 의미 있음). */
  canForce: boolean;
};

const COPY: Record<
  ActionKind,
  { title: string; ask: string; note: string; confirm: string }
> = {
  force: {
    title: "강제 예약",
    ask: "결재 단계 없이 즉시 예약 완료 처리하시겠습니까?",
    note: "미처리 결재 단계는 '건너뜀' 으로 기록되고 신청 상태가 예약완료로 바뀝니다.",
    confirm: "예약 확정",
  },
  reject: {
    title: "강제 반려",
    ask: "결재 단계 없이 즉시 반려 처리하시겠습니까?",
    note: "미처리 결재 단계는 '반려' 로 기록되고 신청 상태가 반려로 바뀝니다.",
    confirm: "반려 확정",
  },
  delete: {
    title: "신청서 삭제",
    ask: "정말 이 신청서를 삭제하시겠습니까?",
    note: "삭제 후 복구할 수 없습니다. 결재 이력도 함께 사라집니다.",
    confirm: "삭제 확정",
  },
};

export function AdminActions({ reservationId, canForce }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<ActionKind | null>(null);
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
        return;
      }
      if (open === "force") {
        const res = await forceReserve(reservationId);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
        setOpen(null);
        return;
      }
      if (open === "reject") {
        const res = await forceReject(reservationId);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
        setOpen(null);
      }
    });
  }

  const copy = open ? COPY[open] : null;

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {canForce && (
          <>
            <Button
              size="lg"
              variant="primary"
              onClick={() => setOpen("force")}
            >
              <CheckCircle2 className="h-5 w-5" />
              강제 예약
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setOpen("reject")}
              className="border-red-300 bg-white text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-5 w-5" />
              강제 반려
            </Button>
          </>
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

      {open && copy && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-xl font-bold text-stone-900">
              {copy.title}
            </h2>
            <p className="mb-2 text-base text-stone-800">{copy.ask}</p>
            <p className="mb-5 text-sm text-stone-500">{copy.note}</p>

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
                variant={open === "force" ? "primary" : "danger"}
                onClick={confirmAction}
                disabled={pending}
              >
                {pending ? "처리 중..." : copy.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
