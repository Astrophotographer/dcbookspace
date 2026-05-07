"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
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

/**
 * 부서 추가.
 * - parent_id 비워두면 그룹(대분류). 값을 주면 그 그룹의 자식(leaf).
 * - display_order 는 형제(같은 parent) 내 max+1.
 */
export async function createDepartment(
  fd: FormData,
): Promise<Result<{ dept?: Department }>> {
  const name = String(fd.get("name") ?? "").trim();
  const rawParent = String(fd.get("parent_id") ?? "").trim();
  const parentId = rawParent ? rawParent : null;
  if (!name) return { error: "부서 이름을 입력해주세요." };

  const supabase = createServiceClient();

  // 부모가 leaf 면 자식 추가 거부 — 트리 깊이 2 유지
  if (parentId) {
    const { data: parent, error: ep } = await supabase
      .from("departments")
      .select("parent_id")
      .eq("id", parentId)
      .maybeSingle();
    if (ep) return { error: ep.message };
    if (!parent) return { error: "상위 부서를 찾을 수 없습니다." };
    if (parent.parent_id) {
      return {
        error:
          "소분류 아래로는 추가할 수 없습니다. 그룹(대분류) 아래에만 자식을 둘 수 있어요.",
      };
    }
  }

  const { data: maxRow } = parentId
    ? await supabase
        .from("departments")
        .select("display_order")
        .eq("parent_id", parentId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle()
    : await supabase
        .from("departments")
        .select("display_order")
        .is("parent_id", null)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("departments")
    .insert({ name, display_order: nextOrder, parent_id: parentId })
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

  // 자식이 남아있는 그룹은 삭제 거부 (DB 단에도 on delete restrict 가 걸려 있음)
  const { count: childCount, error: ec } = await supabase
    .from("departments")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  if (ec) return { error: ec.message };
  if ((childCount ?? 0) > 0) {
    return {
      error: `소속 부서 ${childCount}개가 남아있어 삭제할 수 없습니다. 먼저 자식 부서를 정리해주세요.`,
    };
  }

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
  if (!isValidPhone(phone)) return { error: PHONE_INVALID_MESSAGE };

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

/**
 * 같은 그룹 안의 leaf 순서 일괄 갱신.
 * orderedIds 의 인덱스 그대로 display_order 로 박는다.
 */
export async function reorderLeaves(
  groupId: string,
  orderedIds: string[],
): Promise<Result> {
  if (!groupId) return { error: "그룹 ID가 비어있습니다." };
  if (orderedIds.length === 0) return {};

  const supabase = createServiceClient();

  // 검증: 받은 id 들이 모두 해당 그룹의 자식인지
  const { data: rows, error: e0 } = await supabase
    .from("departments")
    .select("id, parent_id")
    .in("id", orderedIds);
  if (e0) return { error: e0.message };
  if (!rows || rows.length !== orderedIds.length) {
    return { error: "일부 부서를 찾을 수 없습니다." };
  }
  if (rows.some((r) => r.parent_id !== groupId)) {
    return { error: "다른 그룹의 부서가 섞여 있습니다." };
  }

  // 일괄 업데이트. 양이 많지 않아 순차 호출로 처리.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("departments")
      .update({ display_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { error: error.message };
  }

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
