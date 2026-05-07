import { cn } from "@/lib/utils";
import { ComponentProps, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base",
        "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
        "disabled:bg-stone-100 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-lg border border-stone-300 bg-white p-3 text-base",
        "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base",
        "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-sm text-stone-500">{hint}</span>
      )}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}
