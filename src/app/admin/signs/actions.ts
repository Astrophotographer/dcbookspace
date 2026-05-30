"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin-server";
import { isFullAdminSession } from "@/lib/admin-session";
import { getGuideElderIdsForSession } from "@/lib/guide-elder-identity";

type SignatureKind = "dept_head" | "elder";
type Result = { ok?: true; error?: string };

const MAX_SIGNATURE_DATA_URL_LENGTH = 700_000;

function validateKind(kind: string): kind is SignatureKind {
  return kind === "dept_head" || kind === "elder";
}

function validateSignatureDataUrl(dataUrl: string): string | null {
  if (!dataUrl) return "사인 이미지 파일을 선택해 주세요.";
  if (dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    return "사인 이미지가 너무 큽니다. 500KB 이하 이미지로 다시 올려주세요.";
  }
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) {
    return "PNG, JPG, WEBP 형식의 이미지 파일만 등록할 수 있습니다.";
  }
  return null;
}

async function canManageDepartment(deptId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };
  if (isFullAdminSession(session)) return { ok: true };
  if (session.kind !== "user" || session.role !== "elder") {
    return { ok: false, error: "지도장로 권한이 필요합니다." };
  }

  const supabase = createServiceClient();
  const guideElderIds = await getGuideElderIdsForSession(supabase, session);
  const { data, error } = await supabase
    .from("departments")
    .select("elder_id")
    .eq("id", deptId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.elder_id || !guideElderIds.includes(data.elder_id)) {
    return { ok: false, error: "담당 부서의 사인만 관리할 수 있습니다." };
  }
  return { ok: true };
}

export async function saveDepartmentSignature(fd: FormData): Promise<Result> {
  const deptId = String(fd.get("dept_id") ?? "");
  const kindRaw = String(fd.get("kind") ?? "");
  const dataUrl = String(fd.get("data_url") ?? "");

  if (!deptId) return { error: "부서 정보가 없습니다." };
  if (!validateKind(kindRaw)) return { error: "사인 종류가 올바르지 않습니다." };
  const validationError = validateSignatureDataUrl(dataUrl);
  if (validationError) return { error: validationError };

  const auth = await canManageDepartment(deptId);
  if (!auth.ok) return { error: auth.error };

  const now = new Date().toISOString();
  const update =
    kindRaw === "dept_head"
      ? {
          dept_head_signature_data_url: dataUrl,
          dept_head_signature_updated_at: now,
        }
      : {
          elder_signature_data_url: dataUrl,
          elder_signature_updated_at: now,
        };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("departments")
    .update(update)
    .eq("id", deptId);
  if (error) return { error: error.message };

  revalidatePath("/admin/signs");
  revalidatePath("/admin/reservations");
  return { ok: true };
}

export async function clearDepartmentSignature(fd: FormData): Promise<Result> {
  const deptId = String(fd.get("dept_id") ?? "");
  const kindRaw = String(fd.get("kind") ?? "");

  if (!deptId) return { error: "부서 정보가 없습니다." };
  if (!validateKind(kindRaw)) return { error: "사인 종류가 올바르지 않습니다." };

  const auth = await canManageDepartment(deptId);
  if (!auth.ok) return { error: auth.error };

  const update =
    kindRaw === "dept_head"
      ? {
          dept_head_signature_data_url: null,
          dept_head_signature_updated_at: null,
        }
      : {
          elder_signature_data_url: null,
          elder_signature_updated_at: null,
        };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("departments")
    .update(update)
    .eq("id", deptId);
  if (error) return { error: error.message };

  revalidatePath("/admin/signs");
  revalidatePath("/admin/reservations");
  return { ok: true };
}
