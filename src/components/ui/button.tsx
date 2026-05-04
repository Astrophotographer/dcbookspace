import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200 border border-stone-300",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100",
};

const SIZE: Record<Size, string> = {
  sm: "h-9  px-3  text-sm",
  md: "h-11 px-5  text-base",
  lg: "h-14 px-7  text-lg",
  xl: "h-16 px-8  text-xl",
};

type Props = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
