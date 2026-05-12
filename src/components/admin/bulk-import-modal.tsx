"use client";

import { useEffect, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BulkRowError } from "@/lib/bulk-csv";

export type BulkColumnGuide = {
  name: string;
  required: boolean;
  help: string;
};

export type BulkValidateResult = {
  ok: boolean;
  count: number;
  errors?: BulkRowError[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  example: string;
  columns: BulkColumnGuide[];
  /** 텍스트 받아서 검증·저장. 한 번에 둘 다 처리 (오류 시 트랜잭션 자체 롤백) */
  onSubmit: (text: string) => Promise<BulkValidateResult>;
  /** 저장 완료 후 호출 (부모가 목록 갱신·router.refresh 등). */
  onSaved?: () => void;
};

/**
 * 외부 wrapper — open 일 때만 ModalBody 를 마운트해서 state 가 자연스럽게 초기화되도록.
 * (useEffect 안 setState 회피 — react-hooks/set-state-in-effect 룰)
 */
export function BulkImportModal(props: Props) {
  if (!props.open) return null;
  return <ModalBody {...props} />;
}

function ModalBody({
  onClose,
  title,
  description,
  example,
  columns,
  onSubmit,
  onSaved,
}: Props) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<BulkRowError[] | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ count: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // Esc 닫기 + body 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, pending]);

  const handleSubmit = () => {
    setErrors(null);
    setGlobalError(null);
    setSuccess(null);
    if (!text.trim()) {
      setGlobalError("내용을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await onSubmit(text);
        if (!res.ok) {
          if (res.errors && res.errors.length > 0) {
            setErrors(res.errors);
          } else {
            setGlobalError("저장에 실패했습니다.");
          }
          return;
        }
        setSuccess({ count: res.count });
        onSaved?.();
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
    >
      <div className="absolute inset-0 bg-stone-900/45 backdrop-blur-[2px]" />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-stone-200/80">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2
              id="bulk-import-title"
              className="text-xl font-bold tracking-tight text-stone-900"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-stone-600">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* 컬럼 가이드 */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="mb-2 text-sm font-semibold text-sky-900">
              컬럼 안내
            </div>
            <ul className="space-y-1 text-sm text-sky-900">
              {columns.map((c) => (
                <li key={c.name} className="flex gap-2">
                  <span className="font-mono font-semibold">
                    {c.name}
                    {c.required ? (
                      <span className="ml-0.5 text-red-600">*</span>
                    ) : null}
                  </span>
                  <span className="text-stone-700">— {c.help}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-sky-800">
              * 표시는 필수 컬럼입니다. Excel/Numbers 표를 복사해서 그대로 붙여
              넣을 수 있습니다 (탭 구분도 자동 감지).
            </div>
          </div>

          {/* 예시 CSV */}
          <div>
            <div className="mb-1.5 text-sm font-semibold text-stone-700">
              예시
            </div>
            <pre className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-800">
              {example}
            </pre>
          </div>

          {/* 입력 텍스트 */}
          <div>
            <label
              htmlFor="bulk-textarea"
              className="mb-1.5 block text-sm font-semibold text-stone-700"
            >
              여기에 붙여넣기
            </label>
            <textarea
              id="bulk-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={pending || !!success}
              rows={10}
              className="w-full rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm shadow-inner focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-stone-50 disabled:opacity-70"
              placeholder="첫 줄은 헤더, 다음 줄부터 데이터…"
            />
          </div>

          {/* 결과 표시 */}
          {success && (
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
              <div className="text-base font-semibold text-emerald-900">
                저장 완료 — {success.count}건이 추가되었습니다.
              </div>
              <div className="mt-1 text-sm text-emerald-800">
                창을 닫으면 목록이 갱신됩니다.
              </div>
            </div>
          )}

          {globalError && !success && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {globalError}
            </div>
          )}

          {errors && errors.length > 0 && !success && (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
              <div className="mb-2 text-base font-semibold text-red-900">
                {errors.length}개 줄에 문제가 있어 저장하지 않았습니다.
              </div>
              <div className="mb-2 text-sm text-red-800">
                아래 행을 수정한 뒤 다시 시도해 주세요. (전체가 한꺼번에 저장되거나,
                전체가 저장되지 않습니다.)
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded bg-white p-3 text-sm text-red-900">
                {errors.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono font-semibold">
                      {e.row}번째 줄
                    </span>
                    <span>— {e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/60 px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onClose}
            disabled={pending}
          >
            {success ? "닫기" : "취소"}
          </Button>
          {!success && (
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={pending || !text.trim()}
            >
              <Upload className="h-5 w-5" />
              {pending ? "저장 중…" : "검증 후 저장"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
