"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import type { AppUser, UserRole } from "@/lib/supabase/types";

function revalidateUserPages() {
  // 결재자 목록 + 결재 라인에 사용자가 등장하는 모든 화면.
  revalidatePath("/admin/users");
  revalidatePath("/admin/departments"); // 부서장·관리장로 매핑
  revalidatePath("/apply"); // 신청 폼의 부서/PIN 검증 시 영향
}

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
  if (!isValidPhone(phone)) return { error: PHONE_INVALID_MESSAGE };

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
  revalidateUserPages();
  return { user: data as AppUser, pin: initialPin ?? undefined };
}

/**
 * 결재자/사용자 삭제.
 * - 이 사용자가 신청서(reservations / reservation_series)의 applicant 로 참조 중이면
 *   FK on delete restrict 때문에 hard delete 불가 → `active=false` 로 비활성화 (soft delete).
 *   비활성화된 사용자는 목록·신청 폼에서 자동으로 사라지지만, 기존 신청 이력의 신청자 정보는 보존됨.
 * - 참조가 없으면 hard delete.
 */
export async function deleteUser(
  id: string,
): Promise<{ result?: "deleted" | "deactivated"; error?: string }> {
  const supabase = createServiceClient();

  const [
    { count: rCount, error: e0 },
    { count: sCount, error: e1 },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", id),
    supabase
      .from("reservation_series")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", id),
  ]);
  if (e0) return { error: e0.message };
  if (e1) return { error: e1.message };

  const hasHistory = (rCount ?? 0) + (sCount ?? 0) > 0;

  if (hasHistory) {
    // 신청 이력 보존: 비활성화. PIN 도 함께 무력화해서 결재 차단.
    const { error } = await supabase
      .from("users")
      .update({
        active: false,
        pin_hash: null,
        pin_attempts: 0,
        pin_locked_until: null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidateUserPages();
    return { result: "deactivated" };
  }

  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateUserPages();
  return { result: "deleted" };
}

/**
 * 결재자별 텔레그램 chat_id 등록·삭제. 빈 문자열을 넘기면 unset.
 * webhook 받는 쪽(n8n 등)이 이 chat_id 로 본인에게 직접 메시지 발송 가능.
 *
 * chat_id 형식 검증은 느슨하게: 숫자(또는 -로 시작하는 그룹 chat) 만 받음.
 */
export async function setTelegramChatId(
  userId: string,
  chatIdRaw: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = createServiceClient();
  const trimmed = chatIdRaw.trim();
  let next: string | null;
  if (trimmed === "") {
    next = null;
  } else if (/^-?\d+$/.test(trimmed)) {
    next = trimmed;
  } else {
    return {
      error: "chat_id 는 숫자 (또는 그룹은 -1234... 형식) 이어야 합니다.",
    };
  }
  const { error } = await supabase
    .from("users")
    .update({ telegram_chat_id: next })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { ok: true };
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
  revalidateUserPages();
  return { pin: tail };
}
