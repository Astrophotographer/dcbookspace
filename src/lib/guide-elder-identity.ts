import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdminSession } from "@/lib/admin-session";

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

export type GuideElderScope = {
  elderIds: string[];
  departmentIds: string[];
};

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export async function getGuideElderIdsForSession(
  supabase: SupabaseServiceClient,
  session: AdminSession | null,
): Promise<string[]> {
  if (session?.kind !== "user" || session.role !== "elder") return [];

  const fallback = [session.userId];
  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, name, phone, role, active")
    .eq("id", session.userId)
    .maybeSingle();
  if (
    currentError ||
    !current ||
    current.role !== "elder" ||
    current.active === false
  ) {
    return fallback;
  }

  const phone = normalizePhone(current.phone);
  if (!phone) return fallback;

  const ids = new Set(fallback);

  // 신규 등록분은 담당장로 휴대폰을 숫자만 저장하므로, 대부분은 이 인덱스 친화적인 경로로 끝난다.
  const { data: exactMatches, error: exactMatchesError } = await supabase
    .from("users")
    .select("id")
    .eq("role", "elder")
    .eq("active", true)
    .eq("name", current.name)
    .eq("phone", phone);
  if (!exactMatchesError) {
    for (const match of exactMatches ?? []) ids.add(match.id);
    if (exactMatches?.length) return [...ids];
  }

  // 예전 데이터처럼 하이픈이 남아있는 경우만 호환 경로로 보정한다.
  const { data: matches, error: matchesError } = await supabase
    .from("users")
    .select("id, phone")
    .eq("role", "elder")
    .eq("active", true)
    .eq("name", current.name);
  if (matchesError || !matches?.length) return fallback;

  for (const match of matches) {
    if (normalizePhone(match.phone) === phone) ids.add(match.id);
  }
  return [...ids];
}

export async function getGuideElderScopeForSession(
  supabase: SupabaseServiceClient,
  session: AdminSession | null,
): Promise<GuideElderScope> {
  const elderIds = await getGuideElderIdsForSession(supabase, session);
  if (elderIds.length === 0) return { elderIds, departmentIds: [] };

  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .not("parent_id", "is", null)
    .in("elder_id", elderIds);
  if (error || !data?.length) return { elderIds, departmentIds: [] };

  return {
    elderIds,
    departmentIds: data.map((d) => d.id),
  };
}
