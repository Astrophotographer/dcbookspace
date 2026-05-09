"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteReservation,
  forceReject,
  forceReserve,
  reviveReservation,
} from "../actions";

type ActionKind = "force" | "reject" | "revive" | "delete";

type Props = {
  reservationId: string;
  /** 강제 예약 가능 여부 — status === 'pending' 일 때만 true */
  canForceApprove: boolean;
  /** 강제 반려 가능 여부 — status === 'pending' OR 'approved' */
  canForceReject: boolean;
  /** 다시 결재 진행 가능 여부 — status === 'rejected' 일 때만 */
  canRevive: boolean;
  /** 사후 강제 반려(이미 예약완료된 건) 인지 — 모달 문구 분기용 */
  isPostApproval: boolean;
};

function buildCopy(
  isPostApproval: boolean,
): Record<
  ActionKind,
  { title: string; ask: string; note: string; confirm: string }
> {
  return {
    force: {
      title: "강제 예약",
      ask: "결재 단계 없이 즉시 예약 완료 처리하시겠습니까?",
      note: "미처리 결재 단계는 '건너뜀' 으로 기록되고 신청 상태가 예약완료로 바뀝니다.",
      confirm: "예약 확정",
    },
    reject: isPostApproval
      ? {
          title: "강제 반려 (예약완료 사후)",
          ask: "이미 예약완료된 신청서를 반려로 되돌리시겠습니까?",
          note: "기존 결재 이력은 그대로 유지되고, 신청 상태만 반려로 바뀝니다. 신청자에게 알림이 발송됩니다.",
          confirm: "반려 확정",
        }
      : {
          title: "강제 반려",
          ask: "결재 단계 없이 즉시 반려 처리하시겠습니까?",
          note: "미처리 결재 단계는 '반려' 로 기록되고 신청 상태가 반려로 바뀝니다.",
          confirm: "반려 확정",
        },
    revive: {
      title: "다시 결재 진행",
      ask: "반려된 신청서를 다시 결재 진행 상태로 되살릴까요?",
      note: "반려 표시였던 결재 단계는 다시 '대기' 로 돌아가고, 이미 통과된 단계는 그대로 유지됩니다. 신청 상태가 '결재 진행중' 으로 표시됩니다.",
      confirm: "다시 진행",
    },
    delete: {
      title: "신청서 삭제",
      ask: "정말 이 신청서를 삭제하시겠습니까?",
      note: "삭제 후 복구할 수 없습니다. 결재 이력도 함께 사라집니다.",
      confirm: "삭제 확정",
    },
  };
}

export function AdminActions({
  reservationId,
  canForceApprove,
  canForceReject,
  canRevive,
  isPostApproval,
}: Props) {
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
        return;
      }
      if (open === "revive") {
        const res = await reviveReservation(reservationId);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
        setOpen(null);
      }
    });
  }

  const copy = open ? buildCopy(isPostApproval)[open] : null;

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {canForceApprove && (
          <Button
            size="lg"
            variant="primary"
            onClick={() => setOpen("force")}
          >
            <CheckCircle2 className="h-5 w-5" />
            강제 예약
          </Button>
        )}
        {canForceReject && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setOpen("reject")}
            className="border-red-300 bg-white text-red-700 hover:bg-red-50"
          >
            <XCircle className="h-5 w-5" />
            강제 반려
          </Button>
        )}
        {canRevive && (
          <Button
            size="lg"
            variant="primary"
            onClick={() => setOpen("revive")}
          >
            <RotateCcw className="h-5 w-5" />
            다시 결재 진행
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
                variant={
                  open === "force" || open === "revive" ? "primary" : "danger"
                }
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
