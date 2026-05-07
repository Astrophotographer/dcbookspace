"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isOwner, useMe } from "@/lib/me";
import { deleteReservation } from "@/app/apply/actions";

type Props = {
  reservationId: string;
  refNo: string | null;
  purpose: string;
  applicantName: string;
  applicantPhone: string;
  editable: boolean;
};

// 신청 즉시 종이로 결재 회람되는 운영 흐름이라, 본인 수정/삭제 노출은 잠시
// 숨겨둔다 (코드는 그대로 유지 — 다시 살릴 땐 SHOW_OWNER_ACTIONS = true 로).
const SHOW_OWNER_ACTIONS = false;

export function OwnerActions({
  reservationId,
  refNo,
  purpose,
  applicantName,
  applicantPhone,
  editable,
}: Props) {
  const router = useRouter();
  const { me, hydrated } = useMe();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 본인이 아니면 아무것도 그리지 않음 (다른 사람한텐 버튼이 보이면 안 됨)
  if (!SHOW_OWNER_ACTIONS) return null;
  if (!hydrated) return null;
  const owner = isOwner(me, {
    name: applicantName,
    phone: applicantPhone,
  });
  if (!owner) return null;

  function handleDelete() {
    if (!me) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteReservation(reservationId, me.name, me.phone);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/reservations");
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-700">
            본인이 작성한 신청서
          </div>
          <div className="text-xs text-stone-500">
            {editable
              ? "결재가 시작되기 전이라 수정할 수 있습니다."
              : "이미 결재가 진행됐거나 마감된 신청서는 수정할 수 없습니다."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Link href={`/reservations/${reservationId}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" />
                수정
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {deleteOpen && (
        <DeleteConfirmModal
          refNo={refNo}
          purpose={purpose}
          pending={pending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({
  refNo,
  purpose,
  pending,
  onCancel,
  onConfirm,
}: {
  refNo: string | null;
  purpose: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="신청서 삭제 확인"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-stone-200 px-6 py-4">
          <h2 className="text-xl font-bold text-stone-900">
            정말 삭제하시겠습니까?
          </h2>
        </div>
        <div className="px-6 py-5 text-stone-700">
          <p className="mb-3">
            이 신청서를 삭제하면 결재 진행 내역도 함께 사라집니다. 되돌릴 수
            없어요.
          </p>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
            <div className="font-semibold text-stone-900">
              #{refNo} · {purpose}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-6 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>
    </div>
  );
}
