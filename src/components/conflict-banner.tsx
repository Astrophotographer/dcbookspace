import { AlertTriangle, Ban } from "lucide-react";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import type { ActiveConflictItem } from "@/lib/conflicts";

/**
 * 결재 페이지에서 충돌(같은 호실·시간 대 다른 신청서)을 사전 안내하는 배너.
 *
 * - level='warn'    (노란색): 충돌 모두 pending — 정보 제공, 결재 진행 가능
 * - level='critical' (빨간색): 한 건 이상 이미 approved — 강한 경고, 결재 진행은 결재자 자율 판단
 *
 * 결재 흐름을 막지 않는다. 마지막 단계의 ConflictResolveModal 은 별개로 동작.
 * 이 배너는 정보 제공, 모달은 액션 결정으로 역할 분리.
 */
type Props = {
  conflicts: ActiveConflictItem[];
  level: "warn" | "critical";
};

export function ConflictBanner({ conflicts, level }: Props) {
  if (conflicts.length === 0) return null;

  const isCritical = level === "critical";
  const Icon = isCritical ? Ban : AlertTriangle;

  return (
    <section
      className={cn(
        "mb-5 rounded-2xl border-2 p-4",
        isCritical
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-6 w-6 flex-none",
            isCritical ? "text-red-600" : "text-amber-600",
          )}
          strokeWidth={2.2}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold">
            {isCritical
              ? "이 시간은 이미 다른 부서가 사용 확정"
              : "같은 시간·장소에 다른 신청서가 있어요"}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {conflicts.map((c) => {
              const sameDay = c.start_at.slice(0, 10) === c.end_at.slice(0, 10);
              return (
                <li
                  key={`${c.kind}-${c.id}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                >
                  <span className="font-medium">
                    #{c.ref_no ?? c.id.slice(0, 8)}
                  </span>
                  <span className="text-stone-700">·</span>
                  <span>{c.dept?.name ?? "-"}</span>
                  <span className="text-stone-500">
                    ({c.applicant?.name ?? "-"})
                  </span>
                  <span className="text-stone-700">·</span>
                  <span className="font-mono text-xs">
                    {formatDateTime(c.start_at)} ~{" "}
                    {sameDay ? formatTime(c.end_at) : formatDateTime(c.end_at)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      c.status === "approved"
                        ? "bg-red-200 text-red-900"
                        : "bg-amber-200 text-amber-900",
                    )}
                  >
                    {c.status === "approved" ? "확정" : "결재중"}
                  </span>
                </li>
              );
            })}
          </ul>
          {isCritical && (
            <p className="mt-3 text-sm">
              결재를 진행해도 같은 시간에 두 예약이 공존하게 됩니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
