"use client";

import {
  useRealtimeRefresh,
  type RealtimeSpec,
} from "@/lib/supabase/use-realtime-refresh";

/**
 * 서버 컴포넌트 페이지에서 실시간 갱신을 켜고 싶을 때 자식으로 mount.
 * UI 는 그리지 않고 effect 만 실행 — Supabase Realtime publication 의 변경을
 * 감지하면 router.refresh() 로 페이지를 다시 fetch.
 *
 * 단순 사용:
 *   <RealtimeRefresh tables={["reservations", "approvals"]} />
 *
 * 행 단위 필터(권장) — 자기 신청서 변경만 broadcast 받음:
 *   <RealtimeRefresh tables={[
 *     { table: "reservations", filter: `id=eq.${id}` },
 *     { table: "approvals", filter: `reservation_id=eq.${id}` },
 *   ]} />
 */
export function RealtimeRefresh({
  tables,
}: {
  tables: readonly RealtimeSpec[];
}) {
  useRealtimeRefresh(tables);
  return null;
}
