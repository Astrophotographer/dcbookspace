"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { Notice } from "@/lib/supabase/types";

type Result<T = unknown> = T & { error?: string };

function revalidateAll() {
  revalidatePath("/notices");
  revalidatePath("/admin/notices");
}

function readForm(fd: FormData) {
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();

  if (!title) return { error: "제목을 입력해주세요." };
  if (title.length > 120) return { error: "제목은 120자 이내로 입력해주세요." };
  if (!body) return { error: "내용을 입력해주세요." };
  if (body.length > 5000) return { error: "내용은 5000자 이내로 입력해주세요." };

  return { title, body };
}

export async function createNotice(
  fd: FormData,
): Promise<Result<{ notice?: Notice }>> {
  const parsed = readForm(fd);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notices")
    .insert(parsed)
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidateAll();
  return { notice: data as Notice };
}

export async function updateNotice(
  id: string,
  fd: FormData,
): Promise<Result> {
  const parsed = readForm(fd);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("notices")
    .update(parsed)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}

export async function deleteNotice(id: string): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}
