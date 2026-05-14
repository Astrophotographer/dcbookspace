"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-server";
import { createServiceClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function deleteTelegramSubscriber(id: string): Promise<Result> {
  if (!(await isAdmin())) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }

  const subscriberId = id.trim();
  if (!subscriberId) {
    return { ok: false, error: "삭제할 신청자를 찾을 수 없습니다." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("telegram_subscribers")
    .delete()
    .eq("id", subscriberId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/telegram");
  return { ok: true };
}
