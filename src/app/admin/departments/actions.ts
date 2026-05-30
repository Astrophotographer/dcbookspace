"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/auth";
import { isValidPhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import type { AppUser, Department, UserRole } from "@/lib/supabase/types";
import {
  checkRequiredHeaders,
  makeRowAccessor,
  parseCsv,
  type BulkRowError,
} from "@/lib/bulk-csv";

type Result<T = unknown> = T & { error?: string };

type DepartmentImportItem = {
  group: string;
  leaf?: string;
  head_name?: string;
  head_phone?: string;
  head_pin_hash?: string;
  elder_name?: string;
  elder_phone?: string;
  elder_pin_hash?: string;
};

type ExistingElder = Pick<AppUser, "id" | "name" | "phone" | "pin_hash">;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function phoneTail(phone: string): string {
  return normalizePhone(phone).slice(-4);
}

function elderIdentityKey(name: string, phone: string): string {
  return `${name.trim()}\u0000${normalizePhone(phone)}`;
}

function contactHashKey(role: UserRole, name: string, phone: string): string {
  return `${role}\u0000${elderIdentityKey(name, phone)}`;
}

function makePinHashCache() {
  const cache = new Map<string, Promise<string>>();
  return (key: string, phone: string) => {
    let promise = cache.get(key);
    if (!promise) {
      promise = hashPin(phoneTail(phone));
      cache.set(key, promise);
    }
    return promise;
  };
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

/**
 * CSV 텍스트로 부서를 일괄 등록 (부서장·담당장로 포함).
 * - 컬럼: 대분류 / 소분류 / 부서장이름 / 부서장전화번호 / 장로이름 / 장로전화번호
 * - 소분류 비우면 그룹만 생성 (부서장·장로 컬럼 무시)
 * - 부서장·장로는 이름+전화번호 둘 다 채워야 등록됨. PIN 은 휴대폰 뒷 4자리.
 * - bulk_insert_departments RPC 호출 (PL/pgSQL 트랜잭션 → 중간 실패 시 자동 ROLLBACK).
 */
export async function bulkImportDepartments(text: string): Promise<{
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
    { keys: ["대분류"], label: "대분류" },
  ]);
  if (missing) return { ok: false, count: 0, errors: [{ row: 1, message: missing }] };
  if (parsed.rows.length === 0) {
    return { ok: false, count: 0, errors: [{ row: 1, message: "데이터 줄이 없습니다." }] };
  }

  const get = makeRowAccessor(parsed.headers);
  const errors: BulkRowError[] = [];

  const items: DepartmentImportItem[] = [];

  // 부서장·장로 둘 중 하나라도 phone 검증 실패하면 그 행 자체를 에러로 보내고
  // 나머지 처리 중단 (한 줄이라도 오류 시 전체 중단 정책).
  for (const r of parsed.rows) {
    const lineNo = parsed.sourceLine[r.row];
    const group = get(r.cells, "대분류").trim();
    const leaf = get(r.cells, "소분류").trim();
    const headName = get(r.cells, "부서장이름", "부서장").trim();
    const headPhoneRaw = get(r.cells, "부서장전화번호", "부서장휴대폰").trim();
    const elderName = get(r.cells, "장로이름", "담당장로").trim();
    const elderPhoneRaw = get(r.cells, "장로전화번호", "장로휴대폰").trim();

    if (!group) {
      errors.push({ row: lineNo, message: "대분류 이름이 비어있습니다." });
      continue;
    }

    const item: DepartmentImportItem = { group };
    if (leaf) item.leaf = leaf;

    // 부서장·장로는 leaf 가 있을 때만 의미 있음
    if (leaf) {
      // 부서장
      const hasHeadName = !!headName;
      const hasHeadPhone = !!headPhoneRaw;
      if (hasHeadName !== hasHeadPhone) {
        errors.push({
          row: lineNo,
          message: "부서장은 이름·전화번호 둘 다 채우거나 둘 다 비워주세요.",
        });
        continue;
      }
      if (hasHeadName) {
        const phone = headPhoneRaw.replace(/\D/g, "");
        if (!isValidPhone(phone)) {
          errors.push({ row: lineNo, message: `부서장 ${PHONE_INVALID_MESSAGE}` });
          continue;
        }
        item.head_name = headName;
        item.head_phone = phone;
      }

      // 담당장로
      const hasElderName = !!elderName;
      const hasElderPhone = !!elderPhoneRaw;
      if (hasElderName !== hasElderPhone) {
        errors.push({
          row: lineNo,
          message: "담당장로는 이름·전화번호 둘 다 채우거나 둘 다 비워주세요.",
        });
        continue;
      }
      if (hasElderName) {
        const phone = elderPhoneRaw.replace(/\D/g, "");
        if (!isValidPhone(phone)) {
          errors.push({ row: lineNo, message: `담당장로 ${PHONE_INVALID_MESSAGE}` });
          continue;
        }
        item.elder_name = elderName;
        item.elder_phone = phone;
      }
    } else if (headName || headPhoneRaw || elderName || elderPhoneRaw) {
      // leaf 비어있는데 부서장/장로 채워진 경우 — 명확히 알려줌
      errors.push({
        row: lineNo,
        message: "부서장·담당장로는 소분류(부서명) 가 있는 줄에만 입력할 수 있습니다.",
      });
      continue;
    }

    items.push(item);
  }

  if (errors.length > 0) return { ok: false, count: 0, errors };

  const supabase = createServiceClient();
  const getPinHash = makePinHashCache();

  for (const item of items) {
    if (item.head_name && item.head_phone) {
      item.head_pin_hash = await getPinHash(
        contactHashKey("dept_head", item.head_name, item.head_phone),
        item.head_phone,
      );
    }
  }

  const elderItems = items.filter(
    (item): item is DepartmentImportItem & { elder_name: string; elder_phone: string } =>
      !!item.elder_name && !!item.elder_phone,
  );
  if (elderItems.length > 0) {
    const elderNames = [...new Set(elderItems.map((item) => item.elder_name))];
    const { data: existingElders, error: existingError } = await supabase
      .from("users")
      .select("id, name, phone, pin_hash")
      .eq("role", "elder")
      .eq("active", true)
      .in("name", elderNames);
    if (existingError) {
      return { ok: false, count: 0, errors: [{ row: 1, message: existingError.message }] };
    }

    const existingByIdentity = new Map<string, ExistingElder>();
    for (const elder of (existingElders ?? []) as ExistingElder[]) {
      existingByIdentity.set(elderIdentityKey(elder.name, elder.phone ?? ""), elder);
    }

    for (const item of elderItems) {
      const existing = existingByIdentity.get(
        elderIdentityKey(item.elder_name, item.elder_phone),
      );
      if (!existing?.pin_hash) {
        item.elder_pin_hash = await getPinHash(
          contactHashKey("elder", item.elder_name, item.elder_phone),
          item.elder_phone,
        );
      }
    }
  }

  const { data, error } = await supabase.rpc("bulk_insert_departments", {
    items,
  });
  if (error) {
    return { ok: false, count: 0, errors: [{ row: 1, message: error.message }] };
  }

  revalidateAll();
  return { ok: true, count: typeof data === "number" ? data : items.length };
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
  const normalizedPhone = normalizePhone(phone);
  if (!name || !phone) return { error: "이름과 휴대폰을 모두 입력해주세요." };
  if (!isValidPhone(normalizedPhone)) return { error: PHONE_INVALID_MESSAGE };

  const tail = phoneTail(normalizedPhone);
  if (tail.length !== 4) {
    return {
      error:
        "휴대폰 뒷 4자리가 초기 비밀번호입니다. 휴대폰 번호를 정확히 입력해주세요.",
    };
  }

  const supabase = createServiceClient();
  let pinHash: string | null = null;
  const getPinHash = async () => {
    pinHash ??= await hashPin(tail);
    return pinHash;
  };

  if (role === "elder") {
    const { data: exactExisting, error: exactFindError } = await supabase
      .from("users")
      .select("*")
      .eq("name", name)
      .eq("role", "elder")
      .eq("active", true)
      .eq("phone", normalizedPhone)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (exactFindError) return { error: exactFindError.message };

    let existing = exactExisting as AppUser | null;
    if (!existing) {
      const { data: existingUsers, error: findError } = await supabase
        .from("users")
        .select("*")
        .eq("name", name)
        .eq("role", "elder")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (findError) return { error: findError.message };

      existing = ((existingUsers ?? []) as AppUser[]).find(
        (u) => normalizePhone(u.phone ?? "") === normalizedPhone,
      ) ?? null;
    }
    if (existing) {
      if (!existing.pin_hash) {
        const nextPinHash = await getPinHash();
        const { error: updateError } = await supabase
          .from("users")
          .update({ pin_hash: nextPinHash })
          .eq("id", existing.id);
        if (updateError) return { error: updateError.message };
        existing.pin_hash = nextPinHash;
      }

      const { error: e2 } = await supabase
        .from("departments")
        .update({ [field]: existing.id })
        .eq("id", deptId);
      if (e2) return { error: e2.message };

      revalidateAll();
      return { user: existing, pin: tail };
    }
  }

  const nextPinHash = await getPinHash();
  const { data: user, error } = await supabase
    .from("users")
    .insert({
      name,
      phone: role === "elder" ? normalizedPhone : phone,
      role,
      dept_id: deptId,
      pin_hash: nextPinHash,
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
