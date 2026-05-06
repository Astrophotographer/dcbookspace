"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import type { AppUser, Department, UserRole } from "@/lib/supabase/types";

type Result<T = unknown> = T & { error?: string };

function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

function revalidateAll() {
  revalidatePath("/admin/departments");
  revalidatePath("/admin/users");
  revalidatePath("/apply");
  revalidatePath("/");
}

export async function createDepartment(
  fd: FormData,
): Promise<Result<{ dept?: Department }>> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "부서 이름을 입력해주세요." };

  const supabase = createServiceClient();

  const { data: maxRow } = await supabase
    .from("departments")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("departments")
    .insert({ name, display_order: nextOrder })
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidateAll();
  return { dept: data as Department };
}

export async function renameDepartment(
  id: string,
  name: string,
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "부서 이름을 입력해주세요." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("departments")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}

export async function deleteDepartment(id: string): Promise<Result> {
  const supabase = createServiceClient();

  // 진행중·확정 신청서가 이 부서를 가리키면 삭제 거부
  const { count: liveCount, error: e0 } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("dept_id", id)
    .in("status", ["pending", "approved"]);
  if (e0) return { error: e0.message };
  if ((liveCount ?? 0) > 0) {
    return {
      error: `진행중·확정된 신청서 ${liveCount}건이 이 부서를 사용 중이라 삭제할 수 없습니다.`,
    };
  }

  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}

async function assignContact(
  deptId: string,
  field: "dept_head_id" | "elder_id",
  role: UserRole,
  fd: FormData,
): Promise<Result<{ user?: AppUser; pin?: string }>> {
  const name = String(fd.get("name") ?? "").trim();
  const phone = String(fd.get("phone") ?? "").trim();
  if (!name || !phone) return { error: "이름과 휴대폰을 모두 입력해주세요." };

  const tail = phoneTail(phone);
  if (tail.length !== 4) {
    return {
      error: "휴대폰 뒷 4자리가 초기 PIN 입니다. 휴대폰 번호를 정확히 입력해주세요.",
    };
  }

  const supabase = createServiceClient();
  const pinHash = await hashPin(tail);

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      name,
      phone,
      role,
      dept_id: deptId,
      pin_hash: pinHash,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  const { error: e2 } = await supabase
    .from("departments")
    .update({ [field]: user.id })
    .eq("id", deptId);
  if (e2) return { error: e2.message };

  revalidateAll();
  return { user: user as AppUser, pin: tail };
}

export async function setDeptHead(deptId: string, fd: FormData) {
  return assignContact(deptId, "dept_head_id", "dept_head", fd);
}

export async function setDeptElder(deptId: string, fd: FormData) {
  return assignContact(deptId, "elder_id", "elder", fd);
}

export async function clearDeptHead(deptId: string): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("departments")
    .update({ dept_head_id: null })
    .eq("id", deptId);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function clearDeptElder(deptId: string): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("departments")
    .update({ elder_id: null })
    .eq("id", deptId);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}
