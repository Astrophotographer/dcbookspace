"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatKst as format } from "@/lib/utils";
import type { ActiveConflictItem } from "@/lib/conflicts";
import {
  cancelByChairman,
  signByPin,
  signBySession,
  type CancelConflictTarget,
} from "./actions";

/**
 * 단일 QR + PIN으로 본인 단계를 자동 승인.
 * 0000은 마스터 키 (모든 단계 강제 승인). 반려는 결재자 폼에서 제공하지 않음.
 *
 * hasAutoSession=true 면 5분 자동 세션 cookie 가 있다는 뜻 → mount 직후
 * signBySession 한 번 시도. 성공하면 done, 본인 단계가 아니거나 만료면 일반 PIN 폼.
 */
export function SignByPinForm({
  token,
  hasAutoSession = false,
}: {
  token: string;
  hasAutoSession?: boolean;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{
    name: string;
    label: string;
    auto?: boolean;
  } | null>(null);
  // 마지막 단계 충돌 모달 — needsConfirm 응답 받으면 노출
  const [conflictPrompt, setConflictPrompt] = useState<{
    conflicts: ActiveConflictItem[];
    via: "pin" | "session";
    pin: string;
  } | null>(null);

  // hasAutoSession 이면 mount 시 한 번만 자동 결재 시도. 실패 (단계 불일치/만료) 시
  // 그냥 일반 PIN 폼으로 fallback. autoTried ref 로 중복 호출 방지.
  const autoTried = useRef(false);
  const [autoChecking, setAutoChecking] = useState(hasAutoSession);
  // mount 시점의 1회 자동 결재 시도. setState 는 promise.then 안에 있어
  // react-hooks/set-state-in-effect 룰을 우회한다.
  useEffect(() => {
    if (!hasAutoSession || autoTried.current) return;
    autoTried.current = true;
    signBySession({ token }).then((res) => {
      if (res.needsConfirm) {
        setConflictPrompt({
          conflicts: res.needsConfirm,
          via: "session",
          pin: "",
        });
        setAutoChecking(false);
      } else if (res.ok) {
        setDone({
          name: res.approverName ?? "",
          label: res.stepLabel ?? "",
          auto: true,
        });
        router.refresh();
      } else {
        setAutoChecking(false);
      }
    });
  }, [hasAutoSession, token, router]);

  if (autoChecking && !done) {
    return (
      <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-6 text-center">
        <div className="mb-2 flex justify-center">
          <Zap className="h-8 w-8 animate-pulse text-blue-600" strokeWidth={2.5} />
        </div>
        <p className="text-xl font-bold text-blue-900">자동 결재 진행 중...</p>
        <p className="mt-2 text-sm text-blue-700">
          5분 자동 세션이 활성화되어 있어 PIN 입력 없이 즉시 처리됩니다.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-xl font-bold">
          {done.auto ? "⚡ 자동 결재 완료" : "✅ 결재 완료"}
        </p>
        <p className="mt-2 text-base">
          {done.label} · {done.name} 님 처리 완료
        </p>
        <p className="mt-3 text-sm text-stone-600">
          {done.auto
            ? "다음 QR도 5분 안에 같은 휴대폰에서 스캔하면 자동으로 진행됩니다."
            : "위 진행 상황에서 누가 어디까지 결재했는지 확인하실 수 있습니다."}
        </p>
      </div>
    );
  }

  // 서버 메시지가 있으면 그대로 노출 (예: "아직 차례가 아닙니다 ...", "이미 결재하셨습니다 ...").
  // 없으면 기본 메시지. 입력 자체 형식 오류 등 클라 단계에서는 기본 메시지로.
  const fail = (msg?: string) => {
    setError(msg ?? "잘못된 번호입니다");
    setShakeKey((k) => k + 1);
    setPin("");
  };

  const submit = () => {
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      fail();
      return;
    }
    startTransition(async () => {
      const res = await signByPin({ token, pin });
      if (res.needsConfirm) {
        // 마지막 단계 충돌 → 모달 띄우고 사용자 결정 대기
        setConflictPrompt({ conflicts: res.needsConfirm, via: "pin", pin });
      } else if (res.error) {
        fail(res.error);
      } else {
        setDone({
          name: res.approverName ?? "",
          label: res.stepLabel ?? "",
        });
        router.refresh();
      }
    });
  };

  /** 충돌 모달 결정 후 재호출. cancelTargets 빈 배열이면 "그대로 승인". */
  const finishWithDecision = (cancelTargets: CancelConflictTarget[]) => {
    if (!conflictPrompt) return;
    const { via, pin: pendingPin } = conflictPrompt;
    setConflictPrompt(null);
    startTransition(async () => {
      const res =
        via === "pin"
          ? await signByPin({
              token,
              pin: pendingPin,
              cancelConflicts: cancelTargets,
            })
          : await signBySession({ token, cancelConflicts: cancelTargets });
      if (res.error) {
        setError(res.error);
      } else if (res.ok) {
        setDone({
          name: res.approverName ?? "",
          label: res.stepLabel ?? "",
          auto: via === "session",
        });
        router.refresh();
      }
    });
  };

  const isError = !!error;

  return (
    <>
    <div
      key={shakeKey}
      className={cn("space-y-4", isError && "animate-shake")}
    >
      <div
        className={cn(
          "rounded-2xl border-2 bg-white p-4",
          isError ? "border-red-400" : "border-stone-300",
        )}
      >
        <label className="block">
          <span className="mb-1 block text-base font-semibold">
            본인 PIN 번호 (4자리)
          </span>
          <p className="mb-2 text-xs text-stone-500">
            차장 / 관리장로 / 당회장 본인의 PIN을 입력해주세요. PIN으로
            결재자가 자동 식별됩니다.
          </p>
          <input
            type="tel"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoFocus
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              if (error) setError(null);
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            className={cn(
              "h-16 w-full rounded-lg border-2 px-4 text-center text-3xl tracking-widest focus:outline-none",
              isError
                ? "border-red-400 text-red-700 focus:border-red-500"
                : "border-stone-300 focus:border-brand-500",
            )}
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-base font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || pin.length !== 4}
        className={cn(
          "inline-flex h-16 w-full items-center justify-center gap-2 rounded-lg text-xl font-bold transition-all",
          "ring-2 ring-offset-2",
          pin.length === 4 && !pending
            ? "bg-blue-600 text-white shadow-lg shadow-blue-300/60 ring-blue-400 hover:bg-blue-700 cursor-pointer"
            : "bg-stone-200 text-stone-500 ring-transparent cursor-not-allowed",
        )}
      >
        {pending ? (
          "처리 중..."
        ) : pin.length === 4 ? (
          <>
            <Check className="h-6 w-6" strokeWidth={3} />
            승인
          </>
        ) : (
          <>
            <Lock className="h-5 w-5" />
            PIN 4자리 입력
          </>
        )}
      </button>
    </div>

    {conflictPrompt && (
      <ConflictResolveModal
        conflicts={conflictPrompt.conflicts}
        pending={pending}
        onCancelAndApprove={() => {
          finishWithDecision(
            conflictPrompt.conflicts.map((c) => ({ kind: c.kind, id: c.id })),
          );
        }}
        onKeepAndApprove={() => finishWithDecision([])}
        onAbort={() => setConflictPrompt(null)}
      />
    )}
    </>
  );
}

function ConflictResolveModal({
  conflicts,
  pending,
  onCancelAndApprove,
  onKeepAndApprove,
  onAbort,
}: {
  conflicts: ActiveConflictItem[];
  pending: boolean;
  onCancelAndApprove: () => void;
  onKeepAndApprove: () => void;
  onAbort: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAbort();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onAbort]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="충돌 신청서 정리 확인"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onAbort();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="border-b border-stone-200 px-6 py-4">
          <h2 className="text-xl font-bold text-stone-900">
            같은 시간·장소에 다른 신청서가 있어요
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            지금 결재를 마치면 이 신청은 확정됩니다. 아래 신청서들도 함께
            취소할까요? <strong>같이 취소</strong>를 누르면 자동으로 정리되고,{" "}
            <strong>그대로 승인</strong>을 누르면 둘 다 살아남아 관리자가
            나중에 정리합니다.
          </p>
        </div>

        <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {conflicts.map((c) => {
            const start = parseISO(c.start_at);
            const end = parseISO(c.end_at);
            const sameDay =
              format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
            return (
              <li
                key={`${c.kind}-${c.id}`}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-stone-700">
                    #{c.ref_no ?? c.id.slice(0, 8)}
                  </span>
                  {c.kind === "series" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      정기
                    </span>
                  )}
                </div>
                <div className="mt-1 text-base font-medium text-stone-900">
                  {c.purpose}
                </div>
                <div className="mt-0.5 text-sm text-stone-700">
                  {format(start, "yyyy/MM/dd (E)", { locale: ko })}{" "}
                  <span className="font-mono">
                    {format(start, "HH:mm")}
                    {sameDay
                      ? `–${format(end, "HH:mm")}`
                      : ` ~ ${format(end, "yyyy/MM/dd HH:mm", { locale: ko })}`}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-stone-600">
                  {[c.dept?.name, c.applicant?.name]
                    .filter(Boolean)
                    .join(" · ") || "(신청자 정보 없음)"}
                  {c.applicant?.phone && (
                    <span className="ml-2 font-mono text-stone-500">
                      {c.applicant.phone}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 border-t border-stone-200 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onAbort} disabled={pending}>
            돌아가기
          </Button>
          <Button
            variant="secondary"
            onClick={onKeepAndApprove}
            disabled={pending}
          >
            그대로 승인 (둘 다 유지)
          </Button>
          <Button
            variant="danger"
            onClick={onCancelAndApprove}
            disabled={pending}
          >
            {pending
              ? "처리 중..."
              : `같이 취소하고 승인 (${conflicts.length}건)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 당회장만 가능한 전체 결재 취소.
 * 2단계 모달:
 *   1) "정말 이 신청을 취소하시겠습니까?" 확인
 *   2) 당회장 PIN 입력 → 검증 → 취소 처리
 * 다른 role의 PIN으로 시도하면 "당회장만 취소가 가능합니다" 메시지.
 */
export function ChairmanCancelForm({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ name: string } | null>(null);

  function reset() {
    setOpen(false);
    setStep(1);
    setPin("");
    setError(null);
  }

  function fail(msg?: string) {
    setError(msg ?? "잘못된 번호입니다");
    setShakeKey((k) => k + 1);
    setPin("");
  }

  function submit() {
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      fail();
      return;
    }
    startTransition(async () => {
      const res = await cancelByChairman({ token, pin });
      if (res.error) fail(res.error);
      else {
        setDone({ name: res.approverName ?? "" });
        router.refresh();
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-6 text-center">
        <p className="text-lg font-semibold text-stone-800">
          결재가 취소되었습니다.
        </p>
        <p className="mt-1 text-sm text-stone-600">
          ({done.name} 당회장 처리) 1단계부터 다시 진행됩니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <p className="text-base font-medium text-amber-900">
          이 신청을 취소하시겠습니까?
        </p>
        <p className="mt-1 text-xs text-amber-800">
          ※ 취소는 <strong>당회장</strong>만 가능합니다.
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            size="lg"
            variant="danger"
            type="button"
            onClick={() => setOpen(true)}
          >
            결재 취소
          </Button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) reset();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {step === 1 ? (
              <>
                <h2 className="mb-2 text-xl font-bold text-stone-900">
                  결재 취소
                </h2>
                <p className="mb-2 text-base text-stone-800">
                  정말 이 신청을 취소하시겠습니까?
                </p>
                <p className="mb-5 text-sm text-stone-500">
                  취소 시 모든 결재가 초기화되고 1단계부터 다시 진행됩니다.
                  취소는 <strong>당회장</strong>만 가능합니다.
                </p>
                <div className="flex justify-end gap-2">
                  <Button size="lg" variant="secondary" onClick={reset}>
                    아니오
                  </Button>
                  <Button
                    size="lg"
                    variant="danger"
                    onClick={() => setStep(2)}
                  >
                    예, 취소합니다
                  </Button>
                </div>
              </>
            ) : (
              <div key={shakeKey} className={cn(error && "animate-shake")}>
                <h2 className="mb-2 text-xl font-bold text-stone-900">
                  당회장 PIN 입력
                </h2>
                <p className="mb-4 text-sm text-stone-600">
                  당회장 본인의 PIN 4자리를 입력해주세요.
                </p>
                <div
                  className={cn(
                    "rounded-2xl border-2 bg-white p-4",
                    error ? "border-red-400" : "border-stone-300",
                  )}
                >
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    autoFocus
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                      if (error) setError(null);
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                    }}
                    className={cn(
                      "h-16 w-full rounded-lg border-2 px-4 text-center text-3xl tracking-widest focus:outline-none",
                      error
                        ? "border-red-400 text-red-700 focus:border-red-500"
                        : "border-stone-300 focus:border-brand-500",
                    )}
                  />
                </div>
                {error && (
                  <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => {
                      setStep(1);
                      setPin("");
                      setError(null);
                    }}
                    disabled={pending}
                  >
                    뒤로
                  </Button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || pin.length !== 4}
                    className={cn(
                      "inline-flex h-14 items-center justify-center gap-2 rounded-lg px-7 text-lg font-bold transition-all",
                      "ring-2 ring-offset-2",
                      pin.length === 4 && !pending
                        ? "bg-red-600 text-white shadow-md shadow-red-300/60 ring-red-400 hover:bg-red-700 cursor-pointer"
                        : "bg-stone-200 text-stone-500 ring-transparent cursor-not-allowed",
                    )}
                  >
                    {pending ? (
                      "처리 중..."
                    ) : pin.length === 4 ? (
                      <>
                        <Check className="h-5 w-5" strokeWidth={3} />
                        취소 확정
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        PIN 4자리 입력
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
