"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import type { AppUser, UserRole } from "@/lib/supabase/types";
import {
  checkRequiredHeaders,
  makeRowAccessor,
  parseCsv,
  type BulkRowError,
} from "@/lib/bulk-csv";

const ROLE_MAP: Record<string, UserRole> = {
  "신청자": "applicant",
  "부서장": "dept_head",
  "장로": "elder",
  "관리장로": "manager",
  "당회장": "senior_pastor",
  "관리자": "admin",
  // 영어도 허용 (개발자가 직접 붙여 넣을 때)
  applicant: "applicant",
  dept_head: "dept_head",
  elder: "elder",
  manager: "manager",
  senior_pastor: "senior_pastor",
  admin: "admin",
};

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
 * CSV 텍스트로 사용자(결재자 포함) 를 일괄 등록.
 * - 한 줄이라도 검증 실패 시 전체 중단.
 * - 컬럼: 이름, 휴대폰, 역할 / 옵션: 부서
 * - 부서명은 leaf 우선. 동명 leaf 가 여럿이면 "대분류>소분류" 형식 요구.
 * - 결재자(부서장/장로/관리장로/당회장)면 휴대폰 뒷 4자리 PIN 자동 발급.
 */
export async function bulkImportUsers(text: string): Promise<{
  ok: boolean;
  count: number;
  errors?: BulkRowError[];
}> {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    return {
      ok: false,
      count: 0,
      errors: [{ row: 1, message: e instanceof Error ? e.message : "CSV 파싱 실패" }],
    };
  }

  const missing = checkRequiredHeaders(parsed.headers, [
    { keys: ["이름"], label: "이름" },
    { keys: ["휴대폰", "전화번호"], label: "휴대폰" },
    { keys: ["역할"], label: "역할" },
  ]);
  if (missing) return { ok: false, count: 0, errors: [{ row: 1, message: missing }] };
  if (parsed.rows.length === 0) {
    return { ok: false, count: 0, errors: [{ row: 1, message: "데이터 줄이 없습니다." }] };
  }

  const get = makeRowAccessor(parsed.headers);
  const supabase = createServiceClient();

  // 부서 매핑용 — 한 번 로드
  const { data: depts } = await supabase
    .from("departments")
    .select("id, name, parent_id");
  const deptsArr = depts ?? [];
  const groupById = new Map(
    deptsArr.filter((d) => d.parent_id === null).map((d) => [d.id, d.name]),
  );

  function resolveDept(input: string, lineNo: number): { id: string | null; err?: BulkRowError } {
    if (!input) return { id: null };
    // "대분류>소분류" 형식이면 정확 매칭
    const m = input.match(/^([^>]+)>(.+)$/);
    if (m) {
      const group = m[1].trim();
      const leaf = m[2].trim();
      const cand = deptsArr.find(
        (d) =>
          d.parent_id !== null &&
          d.name === leaf &&
          groupById.get(d.parent_id) === group,
      );
      if (!cand) {
        return {
          id: null,
          err: { row: lineNo, message: `부서를 찾을 수 없습니다: "${input}"` },
        };
      }
      return { id: cand.id };
    }
    // leaf 이름으로만 — 동명이인 leaf 있으면 거부
    const matches = deptsArr.filter(
      (d) => d.parent_id !== null && d.name === input,
    );
    if (matches.length === 1) return { id: matches[0].id };
    if (matches.length === 0) {
      // 그룹 자체로 시도 (관리자 등 그룹 직속도 허용)
      const grp = deptsArr.find((d) => d.parent_id === null && d.name === input);
      if (grp) return { id: grp.id };
      return {
        id: null,
        err: { row: lineNo, message: `부서를 찾을 수 없습니다: "${input}"` },
      };
    }
    return {
      id: null,
      err: {
        row: lineNo,
        message: `"${input}" 이름의 부서가 ${matches.length}개 있습니다. "대분류>소분류" 형식으로 지정해 주세요.`,
      },
    };
  }

  type ToInsert = {
    name: string;
    phone: string;
    role: UserRole;
    dept_id: string | null;
    pin_hash: string | null;
  };

  const errors: BulkRowError[] = [];
  const records: ToInsert[] = [];

  for (const r of parsed.rows) {
    const lineNo = parsed.sourceLine[r.row];
    const name = get(r.cells, "이름").trim();
    const phoneRaw = get(r.cells, "휴대폰", "전화번호").trim();
    const roleRaw = get(r.cells, "역할").trim();
    const deptInput = get(r.cells, "부서").trim();

    if (!name || !phoneRaw || !roleRaw) {
      errors.push({ row: lineNo, message: "이름·휴대폰·역할은 필수입니다." });
      continue;
    }
    // 휴대폰 — 숫자만 남기고 검증 (010-1234-5678 같은 형식 허용)
    const phone = phoneRaw.replace(/\D/g, "");
    if (!isValidPhone(phone)) {
      errors.push({ row: lineNo, message: PHONE_INVALID_MESSAGE });
      continue;
    }
    const role = ROLE_MAP[roleRaw];
    if (!role) {
      errors.push({ row: lineNo, message: `역할을 알 수 없습니다: "${roleRaw}"` });
      continue;
    }
    const { id: deptId, err: deptErr } = resolveDept(deptInput, lineNo);
    if (deptErr) {
      errors.push(deptErr);
      continue;
    }

    let pinHash: string | null = null;
    if (isApprover(role)) {
      const tail = phoneTail(phone);
      pinHash = await hashPin(tail);
    }

    records.push({ name, phone, role, dept_id: deptId, pin_hash: pinHash });
  }

  if (errors.length > 0) return { ok: false, count: 0, errors };

  const { error } = await supabase.from("users").insert(records);
  if (error) {
    return { ok: false, count: 0, errors: [{ row: 1, message: error.message }] };
  }

  revalidateUserPages();
  return { ok: true, count: records.length };
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
