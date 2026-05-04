"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { Input } from "./ui/input";

type Props = { value: string };

export function DatePicker({ value }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (newDate: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("date", newDate);
    router.push(`?${sp.toString()}`);
  };

  const shift = (days: number) => {
    const next = addDays(parseISO(value), days);
    go(format(next, "yyyy-MM-dd"));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => shift(-1)}
        aria-label="전날"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white hover:bg-stone-50"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <Input
        type="date"
        value={value}
        onChange={(e) => go(e.target.value)}
        className="w-44"
      />
      <button
        onClick={() => shift(1)}
        aria-label="다음날"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white hover:bg-stone-50"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
