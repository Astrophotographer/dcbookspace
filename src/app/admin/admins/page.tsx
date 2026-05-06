import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/supabase/types";
import { AdminsAdmin } from "./admins-admin";

export default async function AdminAdminsPage() {
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
  const { data: admins } = await supabase
    .from("users")
    .select("*")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold">관리자 정보</h1>
        <p className="mb-6 text-sm text-stone-600">
          관리자는 <strong>휴대폰 뒷 4자리</strong>가 마스터 PIN 으로 발급되며,
          어떤 결재 단계든 강제 승인할 수 있습니다. 비상용 마스터 키
          <span className="mx-1 rounded bg-stone-100 px-1.5 py-0.5 font-mono">
            0000
          </span>
          은 코드에 별도로 유지됩니다.
        </p>
        <AdminsAdmin initialAdmins={(admins ?? []) as AppUser[]} />
      </main>
    </>
  );
}
