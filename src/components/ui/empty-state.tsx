import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** lucide-react 아이콘. 없으면 텍스트만 표시. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** "compact" 는 좁은 자리(테이블 셀, 사이드 패널)용 — padding↓, 아이콘 작게. */
  variant?: "default" | "compact";
  className?: string;
};

/**
 * "데이터 없음" 상태를 통일된 모양으로 표시.
 * 기존에 흩어진 dashed border 박스들을 이 컴포넌트로 수렴.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  variant = "default",
  className,
}: Props) {
  const compact = variant === "compact";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50/60 text-center",
        compact ? "gap-1.5 px-4 py-5" : "gap-2 px-6 py-8",
        className,
      )}
    >
      {Icon && (
        <Icon
          aria-hidden
          className={cn(
            "text-stone-400",
            compact ? "h-5 w-5" : "h-7 w-7",
          )}
        />
      )}
      <div
        className={cn(
          "font-medium text-stone-600",
          compact ? "text-sm" : "text-base",
        )}
      >
        {title}
      </div>
      {description && (
        <div className="text-sm leading-relaxed text-stone-500">
          {description}
        </div>
      )}
    </div>
  );
}
