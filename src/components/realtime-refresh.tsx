"use client";

import { useRealtimeRefresh } from "@/lib/supabase/use-realtime-refresh";

/**
 * 서버 컴포넌트 페이지에서 실시간 갱신을 켜고 싶을 때 자식으로 mount 한다.
 * UI 는 그리지 않고 effect 만 실행 — Supabase Realtime publication 의 변경을
 * 감지하면 router.refresh() 로 페이지를 다시 fetch.
 *
 * 사용 예:
 *   <RealtimeRefresh tables={["reservations", "approvals"]} />
 */
export function RealtimeRefresh({ tables }: { tables: readonly string[] }) {
  useRealtimeRefresh(tables);
  return null;
}
