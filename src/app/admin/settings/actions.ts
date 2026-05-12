"use server";

import { revalidatePath } from "next/cache";
import { setSiteSetting } from "@/lib/site-settings";

/**
 * 프린트 자동 출력·관련 UI 일괄 ON/OFF.
 * 변경 즉시 모든 페이지 캐시 무효화해 새 상태가 반영되게 함.
 */
export async function setPrintEnabled(
  enabled: boolean,
): Promise<{ ok?: true; error?: string }> {
  const res = await setSiteSetting("print_enabled", enabled);
  if ("error" in res) return { error: res.error };

  // 프린트 관련 UI 가 박혀 있는 페이지 전부 invalidate
  revalidatePath("/", "layout");
  return { ok: true };
}
