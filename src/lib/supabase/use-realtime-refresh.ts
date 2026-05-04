"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "./client";

/**
 * 지정된 테이블에 변경이 일어나면 router.refresh()를 호출한다.
 * 서버 컴포넌트가 다시 실행되어 최신 데이터로 자동 갱신된다.
 *
 * 200ms 디바운스로 짧은 시간에 몰린 변경(예: 드래그 후 위치 저장)을 1회로 합친다.
 */
export function useRealtimeRefresh(tables: readonly string[]) {
  const router = useRouter();
  // tables는 호출부에서 안정적인 reference로 넘겨야 함 (배열 리터럴은 매 렌더 새 ref → join으로 dep)
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 200);
    };

    let channel = supabase.channel(`app-${key}`);
    for (const table of key.split(",").filter(Boolean)) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
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
