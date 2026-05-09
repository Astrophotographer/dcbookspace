"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "./client";

/**
 * Realtime 구독 spec — 단순 테이블 이름만 주거나, postgres 필터까지 명시 가능.
 *   "reservations"
 *   { table: "reservations", filter: "id=eq.<uuid>" }
 *
 * filter 가 있으면 해당 행 변경만 broadcast 받음 — 같은 페이지에 동시 활성 신청서가
 * 많아도 트래픽이 N 으로 폭발하지 않음.
 */
export type RealtimeSpec =
  | string
  | { table: string; filter?: string };

/**
 * 지정된 테이블/행에 변경이 일어나면 router.refresh() 호출.
 * 200ms 디바운스로 짧은 시간에 몰린 변경을 1회로 합친다.
 */
export function useRealtimeRefresh(specs: readonly RealtimeSpec[]) {
  const router = useRouter();
  // 사양을 안정적인 dep key 로 직렬화. spec 객체가 매 렌더 새 reference 여도 키는 같음.
  const key = specs
    .map((s) => (typeof s === "string" ? s : `${s.table}|${s.filter ?? ""}`))
    .join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 200);
    };

    let channel = supabase.channel(`app-${key}`);
    for (const part of key.split(",").filter(Boolean)) {
      const [table, filter] = part.split("|");
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        trigger,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, key]);
}
