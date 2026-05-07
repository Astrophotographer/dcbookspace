"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import { updateAdminPassword } from "@/lib/admin-credentials";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import type { AppUser } from "@/lib/supabase/types";

/**
 * 사이트 로그인 비밀번호 변경 (BasicAuth 대체 — DB-stored hash).
 * env (.env.local 의 ADMIN_PASSWORD) 는 비상 키로 영구 유효.
 */
export async function changeSitePassword(
  fd: FormData,
): Promise<{ ok?: true; error?: string }> {
  const username = String(fd.get("username") ?? "").trim();
  const currentPassword = String(fd.get("current_password") ?? "");
  const newPassword = String(fd.get("new_password") ?? "");
  const confirmPassword = String(fd.get("confirm_password") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "새 비밀번호가 서로 일치하지 않습니다." };
  }

  const res = await updateAdminPassword({
    username,
    currentPassword,
    newPassword,
  });
  if (res.error) return { error: res.error };
  return { ok: true };
}

function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

/**
 * 관리자(admin) 추가. 휴대폰 뒷 4자리를 마스터 PIN 으로 자동 발급한다.
 * 등록 직후 평문 PIN 을 1회 노출 (운영자가 본인에게 안내).
 */
export async function createAdmin(
  fd: FormData,
): Promise<{ user?: AppUser; pin?: string; error?: string }> {
  const supabase = createServiceClient();
  const name = String(fd.get("name") ?? "").trim();
  const phone = String(fd.get("phone") ?? "").trim();

  if (!name || !phone) return { error: "이름과 휴대폰은 필수입니다." };
  if (!isValidPhone(phone)) return { error: PHONE_INVALID_MESSAGE };

  const tail = phoneTail(phone);
  if (tail.length !== 4) {
    return {
      error:
        "휴대폰 뒷 4자리를 마스터 PIN 으로 사용합니다. 휴대폰 번호를 정확히 입력해주세요.",
    };
  }
  if (tail === "0000") {
    return {
      error:
        "PIN 0000 은 비상용 마스터 키로 예약되어 있습니다. 다른 휴대폰 번호를 사용해주세요.",
    };
  }

  const pinHash = await hashPin(tail);

  const { data, error } = await supabase
    .from("users")
    .insert({
      name,
      phone,
      role: "admin",
      pin_hash: pinHash,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { user: data as AppUser, pin: tail };
}

/**
 * 관리자 삭제. 마지막 한 명은 삭제 불가 (시스템 마스터 권한자 0명 방지).
 */
export async function deleteAdmin(id: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();

  const { count, error: e0 } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);
  if (e0) return { error: e0.message };
  if ((count ?? 0) <= 1) {
    return {
      error:
        "관리자가 최소 1명은 있어야 합니다. 새 관리자를 먼저 추가한 뒤 삭제해주세요.",
    };
  }

  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

/**
 * 마스터 PIN 재발급. 휴대폰 뒷 4자리로 다시 설정한다.
 */
export async function issueAdminPin(
  userId: string,
): Promise<{ pin?: string; error?: string }> {
  const supabase = createServiceClient();

  const { data: user, error: e0 } = await supabase
    .from("users")
    .select("phone, role")
    .eq("id", userId)
    .single();
  if (e0 || !user) return { error: "관리자를 찾을 수 없습니다." };
  if (user.role !== "admin") return { error: "관리자가 아닙니다." };

  const tail = phoneTail(user.phone ?? "");
  if (tail.length !== 4) {
    return {
      error:
        "휴대폰 뒷 4자리를 추출할 수 없습니다. 휴대폰 번호를 먼저 갱신해주세요.",
    };
  }
  if (tail === "0000") {
    return {
      error:
        "PIN 0000 은 비상용 마스터 키로 예약되어 있습니다. 휴대폰 번호를 변경해주세요.",
    };
  }

  const hash = await hashPin(tail);
  const { error } = await supabase
    .from("users")
    .update({ pin_hash: hash, pin_attempts: 0, pin_locked_until: null })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { pin: tail };
}
