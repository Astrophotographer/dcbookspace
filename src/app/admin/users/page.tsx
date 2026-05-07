import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppUser, Department } from "@/lib/supabase/types";
import { ROLE_LABEL } from "@/lib/supabase/types";
import { UsersAdmin } from "./users-admin";

export default async function AdminUsersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }
  const supabase = createServiceClient();
  const [{ data: users }, { data: depts }] = await Promise.all([
    // 관리자(admin) 는 /admin/admins 에서 따로 관리하므로 여기 목록에서 제외
    // 비활성(active=false) 사용자도 숨김 — soft delete 된 결재자는 신청 이력에만 남음
    supabase
      .from("users")
      .select("*")
      .neq("role", "admin")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("*").order("display_order"),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold">결재자정보</h1>
        <p className="mb-6 text-sm text-stone-600">
          결재자(차장 · 관리장로 · 당회장 등)는 추가 시 <strong>휴대폰 뒷 4자리</strong>가
          자동으로 초기 PIN으로 설정됩니다. 본인이 처음 결재할 때 변경하도록
          안내해주세요.
        </p>
        <UsersAdmin
          initialUsers={(users ?? []) as AppUser[]}
          departments={(depts ?? []) as Department[]}
          roleLabels={ROLE_LABEL}
        />
      </main>
    </>
  );
}
