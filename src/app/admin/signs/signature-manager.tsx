"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import {
  clearDepartmentSignature,
  saveDepartmentSignature,
} from "./actions";

export type SignatureDepartment = {
  id: string;
  name: string;
  deptHeadName: string | null;
  elderName: string | null;
  deptHeadSignatureDataUrl: string | null;
  deptHeadSignatureUpdatedAt: string | null;
  elderSignatureDataUrl: string | null;
  elderSignatureUpdatedAt: string | null;
};

type SignatureKind = "dept_head" | "elder";

type Props = {
  departments: SignatureDepartment[];
};

export function SignatureManager({ departments }: Props) {
  if (departments.length === 0) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <ImageIcon className="mx-auto h-9 w-9 text-stone-400" />
        <h2 className="mt-3 text-lg font-bold text-stone-900">
          사인을 등록할 담당 부서가 없습니다.
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          부서관리에서 지도장로를 먼저 등록해 주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      {departments.map((dept) => {
        const complete =
          !!dept.deptHeadSignatureDataUrl && !!dept.elderSignatureDataUrl;
        return (
          <article
            key={dept.id}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  {dept.name}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  부서장 {dept.deptHeadName ?? "미지정"} · 지도장로{" "}
                  {dept.elderName ?? "미지정"}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                  complete
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800",
                )}
              >
                {complete && <CheckCircle2 className="h-3.5 w-3.5" />}
                {complete ? "사인 2개 등록됨" : "사인 등록 필요"}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SignatureSlot
                deptId={dept.id}
                kind="dept_head"
                title="부서장 사인"
                personName={dept.deptHeadName}
                currentDataUrl={dept.deptHeadSignatureDataUrl}
                updatedAt={dept.deptHeadSignatureUpdatedAt}
              />
              <SignatureSlot
                deptId={dept.id}
                kind="elder"
                title="지도장로 사인"
                personName={dept.elderName}
                currentDataUrl={dept.elderSignatureDataUrl}
                updatedAt={dept.elderSignatureUpdatedAt}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}

function SignatureSlot({
  deptId,
  kind,
  title,
  personName,
  currentDataUrl,
  updatedAt,
}: {
  deptId: string;
  kind: SignatureKind;
  title: string;
  personName: string | null;
  currentDataUrl: string | null;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const displayUrl = preview ?? currentDataUrl;

  function save() {
    if (!preview) {
      setError("새 사인 이미지 파일을 먼저 선택해 주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("dept_id", deptId);
    fd.set("kind", kind);
    fd.set("data_url", preview);
    startTransition(async () => {
      const res = await saveDepartmentSignature(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setPreview(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function clear() {
    if (!currentDataUrl) return;
    if (!confirm(`${title}을 삭제할까요?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("dept_id", deptId);
    fd.set("kind", kind);
    startTransition(async () => {
      const res = await clearDepartmentSignature(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setPreview(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900">{title}</h3>
          <p className="mt-0.5 text-sm text-stone-500">
            {personName ?? "담당자 미지정"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold",
            currentDataUrl
              ? "bg-emerald-100 text-emerald-800"
              : "bg-stone-200 text-stone-600",
          )}
        >
          {currentDataUrl ? "등록됨" : "미등록"}
        </span>
      </div>

      <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-stone-300 bg-white p-3">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 data URL 미리보기
          <img
            src={displayUrl}
            alt={`${title} 미리보기`}
            className="max-h-28 max-w-full object-contain"
          />
        ) : (
          <div className="text-center text-sm text-stone-400">
            <ImageIcon className="mx-auto mb-2 h-8 w-8" />
            사인 이미지 없음
          </div>
        )}
      </div>

      <div className="mt-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50">
          <Upload className="h-4 w-4" aria-hidden />
          이미지 선택
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setError(null);
              setPreview(null);
              setFileName("");
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                setError("이미지 파일만 선택할 수 있습니다.");
                return;
              }
              if (file.size > 500_000) {
                setError("500KB 이하 이미지로 다시 선택해 주세요.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setPreview(typeof reader.result === "string" ? reader.result : null);
                setFileName(file.name);
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {fileName && (
          <span className="ml-2 align-middle text-xs text-stone-500">
            {fileName}
          </span>
        )}
      </div>

      {updatedAt && (
        <p className="mt-2 text-xs text-stone-500">
          마지막 등록: {formatDateTime(updatedAt)}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={pending || !preview}
        >
          {currentDataUrl ? "새 사인 저장" : "사인 등록"}
        </Button>
        {currentDataUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={pending}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        )}
      </div>
    </div>
  );
}
