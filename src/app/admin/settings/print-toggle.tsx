"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPrintEnabled } from "./actions";

type Props = {
  initialEnabled: boolean;
};

/**
 * 프린트 자동 출력 ON/OFF 토글. 토글 클릭 → 서버 액션 → 사이트 전체 revalidate.
 * Optimistic UI: 즉시 상태 반영, 서버 응답이 실패면 롤백 + 에러 노출.
 */
export function PrintToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const res = await setPrintEnabled(next);
      if (res.error) {
        setEnabled(!next); // 롤백
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 flex-none place-items-center rounded-full",
            enabled ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-500",
          )}
        >
          <Printer className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-stone-900">
              프린트 자동 출력
            </h2>
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              role="switch"
              aria-checked={enabled}
              className={cn(
                "relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                enabled ? "bg-brand-600" : "bg-stone-300",
                pending && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {enabled
              ? "신청 시 사무실 프린터로 결재 서류가 자동 인쇄됩니다. 진행 상태와 실패 알림이 표시됩니다."
              : "신청 시 자동 인쇄가 비활성화됩니다. 진행 상태와 실패 알림은 숨겨지지만, 관리자 신청서 상세의 재출력 버튼은 계속 사용할 수 있습니다."}
          </p>
          {error && (
            <p className="mt-2 text-sm text-red-700">설정 저장 실패: {error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
