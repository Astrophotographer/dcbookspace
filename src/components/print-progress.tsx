"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  CircleAlert,
  Loader2,
  Printer,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";
import { setPrintStatus } from "@/app/print/actions";
import type { PrintStatus } from "@/lib/supabase/types";

// 실제 프린터 연동이 들어오기 전, 테스트로 상태를 수동 전이하기 위한 패널.
// 운영 배포 전에 false 로 바꾸면 사라짐.
const SHOW_PRINT_TEST_PANEL = true;

const TIMEOUT_MS = 30_000;

const STEPS: {
  key: PrintStatus;
  label: string;
}[] = [
  { key: "requested", label: "프린트 요청" },
  { key: "printing", label: "프린트 진행중" },
  { key: "completed", label: "프린트 진행완료" },
];

const STATUS_INDEX: Record<PrintStatus, number> = {
  requested: 0,
  printing: 1,
  completed: 2,
  failed: -1,
};

type Props = {
  kind: "reservation" | "series";
  id: string;
  status: PrintStatus;
  /** print_status 마지막 갱신 시각 (ISO). 30초 타임아웃 계산 기준. */
  statusAt: string;
};

export function PrintProgress({ kind, id, status, statusAt }: Props) {
  // 같은 행이 다른 곳(워커, 테스트 버튼)에서 갱신되면 페이지 다시 그리기
  useRealtimeRefresh([
    kind === "series" ? "reservation_series" : "reservations",
  ]);

  // 30초 타임아웃 — status='requested' 가 30초 넘게 지속되면 자동 'failed' 로 전환
  const triggered = useRef(false);
  useEffect(() => {
    triggered.current = false;
    if (status !== "requested") return;
    const elapsed = Date.now() - new Date(statusAt).getTime();
    const remaining = Math.max(0, TIMEOUT_MS - elapsed);
    const t = setTimeout(() => {
      if (triggered.current) return;
      triggered.current = true;
      setPrintStatus({ kind, id, status: "failed" }).catch(() => {});
    }, remaining);
    return () => clearTimeout(t);
  }, [status, statusAt, kind, id]);

  const idx = STATUS_INDEX[status];
  const isFailed = status === "failed";

  return (
    <section
      className={cn(
        "rounded-2xl border p-5 shadow-sm",
        isFailed
          ? "border-red-300 bg-red-50"
          : "border-stone-200 bg-white",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <Printer
          className={cn(
            "h-5 w-5",
            isFailed ? "text-red-600" : "text-stone-700",
          )}
        />
        <h2
          className={cn(
            "text-lg font-semibold",
            isFailed ? "text-red-800" : "text-stone-900",
          )}
        >
          프린트 진행 상황
        </h2>
      </div>

      {isFailed ? (
        <FailedBox kind={kind} id={id} />
      ) : (
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const state =
              i < idx ? "done" : i === idx ? "active" : "pending";
            return (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  state === "done" &&
                    "border-emerald-300 bg-emerald-50 text-emerald-900",
                  state === "active" &&
                    "border-amber-300 bg-amber-50 text-amber-900",
                  state === "pending" &&
                    "border-stone-200 bg-stone-50 text-stone-500",
                )}
              >
                <StepIcon state={state} />
                <span className="text-sm font-medium">{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {SHOW_PRINT_TEST_PANEL && (
        <PrintTestPanel kind={kind} id={id} status={status} />
      )}
    </section>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") return <Check className="h-4 w-4" strokeWidth={3} />;
  if (state === "active")
    return <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />;
  return (
    <span
      className="block h-2 w-2 rounded-full bg-stone-300"
      aria-hidden="true"
    />
  );
}

function FailedBox({
  kind,
  id,
}: {
  kind: "reservation" | "series";
  id: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const retry = () => {
    setError(null);
    startTransition(async () => {
      const res = await setPrintStatus({ kind, id, status: "requested" });
      if (res.error) setError(res.error);
    });
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-red-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-red-600" />
        <div>
          <div className="text-base font-semibold">요청에 문제가 있습니다.</div>
          <div className="text-sm text-red-700">
            사무실 프린터 연결을 확인해 주세요. 다시 요청을 보낼 수 있습니다.
          </div>
          {error && (
            <div className="mt-1 text-xs text-red-700">{error}</div>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={retry}
        disabled={pending}
      >
        <RotateCcw className="h-4 w-4" />
        다시 요청
      </Button>
    </div>
  );
}

/** 실제 프린터 연동 전, 상태 전이 시뮬레이션 버튼들. */
function PrintTestPanel({
  kind,
  id,
  status,
}: {
  kind: "reservation" | "series";
  id: string;
  status: PrintStatus;
}) {
  const [pending, startTransition] = useTransition();
  const fire = (next: PrintStatus) =>
    startTransition(async () => {
      await setPrintStatus({ kind, id, status: next });
    });

  return (
    <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3">
      <div className="mb-2 text-xs font-semibold text-stone-500">
        🧪 테스트 패널 (실제 프린터 연동 전)
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fire("printing")}
          disabled={pending || status === "printing"}
        >
          → 진행중
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fire("completed")}
          disabled={pending || status === "completed"}
        >
          → 완료
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          onClick={() => fire("failed")}
          disabled={pending || status === "failed"}
        >
          → 실패
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fire("requested")}
          disabled={pending || status === "requested"}
        >
          ↺ 다시 요청
        </Button>
      </div>
    </div>
  );
}
