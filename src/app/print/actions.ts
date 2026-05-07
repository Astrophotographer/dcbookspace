"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { PrintStatus } from "@/lib/supabase/types";

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
  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(
    args.kind === "series"
      ? `/series/${args.id}`
      : `/reservations/${args.id}`,
  );
  return {};
}
