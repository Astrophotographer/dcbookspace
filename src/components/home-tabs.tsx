"use client";

import { useState } from "react";
import { CalendarDays, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";

const REALTIME_TABLES = ["rooms", "reservations", "approvals"] as const;

type Props = {
  dateView: React.ReactNode;
  placeView: React.ReactNode;
};

export function HomeTabs({ dateView, placeView }: Props) {
  useRealtimeRefresh(REALTIME_TABLES);
  const [tab, setTab] = useState<"date" | "place">("date");

  return (
    <div>
      <div role="tablist" className="mb-4 flex border-b border-stone-200">
        <button
          role="tab"
          aria-selected={tab === "date"}
          onClick={() => setTab("date")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-base font-medium",
            tab === "date"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-stone-500 hover:text-stone-800",
          )}
        >
          <CalendarDays className="h-5 w-5" />
          날짜별
        </button>
        <button
          role="tab"
          aria-selected={tab === "place"}
          onClick={() => setTab("place")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-base font-medium",
            tab === "place"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-stone-500 hover:text-stone-800",
          )}
        >
          <Building2 className="h-5 w-5" />
          장소별
        </button>
      </div>
      {tab === "date" ? dateView : placeView}
    </div>
  );
}
