"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cancelByChairman, signByPin } from "./actions";

/**
 * 단일 QR + PIN으로 본인 단계를 자동 승인.
 * 0000은 마스터 키 (모든 단계 강제 승인). 반려는 결재자 폼에서 제공하지 않음.
 */
export function SignByPinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ name: string; label: string } | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-xl font-bold">✅ 결재 완료</p>
        <p className="mt-2 text-base">
          {done.label} · {done.name} 님 처리 완료
        </p>
        <p className="mt-3 text-sm text-stone-600">
          위 진행 상황에서 누가 어디까지 결재했는지 확인하실 수 있습니다.
        </p>
      </div>
    );
  }

  const fail = () => {
    setError("잘못된 번호입니다");
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
      if (res.error) {
        fail();
      } else {
        setDone({
          name: res.approverName ?? "",
          label: res.stepLabel ?? "",
        });
        router.refresh();
      }
    });
  };

  const isError = !!error;

  return (
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

  function fail() {
    setError("잘못된 번호입니다");
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
      if (res.error) fail();
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
