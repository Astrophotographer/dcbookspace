"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { PrintStatus } from "@/lib/supabase/types";
import {
  emitReservationEventAfter,
  emitSeriesEventAfter,
} from "@/lib/webhook";

type Result = { error?: string };

/**
 * 신청서/시리즈의 프린트 상태를 변경한다.
 * - 클라이언트 30초 타임아웃 핸들러: status='failed'
 * - 추후 실제 프린터 워커: status='printing' / 'completed'
 * - 테스트 버튼: 모든 상태 전이
 */
export async function setPrintStatus(args: {
  kind: "reservation" | "series";
  id: string;
  status: PrintStatus;
}): Promise<Result> {
  const supabase = createServiceClient();
  const table =
    args.kind === "series" ? "reservation_series" : "reservations";

  const { error } = await supabase
    .from(table)
    .update({ print_status: args.status })
    .eq("id", args.id);
  if (error) return { error: error.message };

  // print_status_at 은 DB 트리거가 자동 갱신.
  // print_status 는 상세 페이지에서만 표시되므로 해당 페이지만 재검증.
  // 홈 캘린더·신청 목록은 print_status 노출 안 하므로 무관 (불필요한 invalidation 제거).
  revalidatePath(
    args.kind === "series"
      ? `/series/${args.id}`
      : `/reservations/${args.id}`,
  );

  // 운영자 알림용: 인쇄 실패가 가장 중요한 이벤트라 이것만 발사.
  // requested/printing/completed 는 정상 흐름이라 시끄럽지 않게 패스.
  if (args.status === "failed") {
    if (args.kind === "series") {
      emitSeriesEventAfter("reservation.print_failed", args.id);
    } else {
      emitReservationEventAfter("reservation.print_failed", args.id);
    }
  }
  return {};
}
