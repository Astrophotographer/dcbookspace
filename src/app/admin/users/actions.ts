"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import type { AppUser, UserRole } from "@/lib/supabase/types";

const APPROVER_ROLES: UserRole[] = [
  "dept_head",
  "elder",
  "manager",
  "senior_pastor",
];
function isApprover(r: UserRole) {
  return APPROVER_ROLES.includes(r);
}

function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

export async function createUser(
  fd: FormData,
): Promise<{ user?: AppUser; pin?: string; error?: string }> {
  const supabase = createServiceClient();
  const name = String(fd.get("name") ?? "").trim();
  const phone = String(fd.get("phone") ?? "").trim();
  const role = String(fd.get("role") ?? "applicant") as UserRole;
  const deptId = String(fd.get("dept_id") ?? "") || null;

  if (!name || !phone) return { error: "이름과 휴대폰은 필수입니다." };

  // 결재자면 휴대폰 뒷 4자리를 초기 PIN으로 자동 등록
  let pinHash: string | null = null;
  let initialPin: string | null = null;
  if (isApprover(role)) {
    const tail = phoneTail(phone);
    if (tail.length !== 4) {
      return {
        error:
          "결재자는 휴대폰 뒷 4자리를 초기 PIN으로 사용합니다. 휴대폰 번호를 정확히 입력해주세요.",
      };
    }
    initialPin = tail;
    pinHash = await hashPin(tail);
  }

  const { data, error } = await supabase
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
  return { user: data as AppUser, pin: initialPin ?? undefined };
}

export async function deleteUser(id: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

/**
 * PIN 재발급. 사용자의 현재 휴대폰 뒷 4자리로 다시 설정한다.
 * (사용자가 휴대폰 번호를 바꿨을 때 또는 PIN을 잊었을 때 사용)
 */
export async function issuePin(
  userId: string,
): Promise<{ pin?: string; error?: string }> {
  const supabase = createServiceClient();

  const { data: user, error: e0 } = await supabase
    .from("users")
    .select("phone")
    .eq("id", userId)
    .single();
  if (e0 || !user)
    return { error: "사용자를 찾을 수 없습니다." };

  const tail = phoneTail(user.phone ?? "");
  if (tail.length !== 4)
    return {
      error: "휴대폰 뒷 4자리를 추출할 수 없습니다. 휴대폰 번호를 먼저 갱신해주세요.",
    };

  const hash = await hashPin(tail);
  const { error } = await supabase
    .from("users")
    .update({ pin_hash: hash, pin_attempts: 0, pin_locked_until: null })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { pin: tail };
}
