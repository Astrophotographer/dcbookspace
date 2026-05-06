import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppUser, Department } from "@/lib/supabase/types";
import { DepartmentsAdmin } from "./departments-admin";

export default async function AdminDeptsPage() {
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
  const { data: depts } = await supabase
    .from("departments")
    .select("*")
    .order("display_order")
    .order("created_at");

  const contactIds = (depts ?? [])
    .flatMap((d) => [d.dept_head_id, d.elder_id])
    .filter((v): v is string => !!v);

  const { data: contacts } = contactIds.length
    ? await supabase.from("users").select("*").in("id", contactIds)
    : { data: [] as AppUser[] };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold">부서관리</h1>
        <p className="mb-6 text-sm text-stone-500">
          신청서 “소속 부서” 항목에 표시되는 부서 목록입니다. 각 부서마다
          부서장·담당장로를 등록하면 결재 흐름에서 자동으로 사용됩니다.
        </p>
        <DepartmentsAdmin
          initialDepartments={(depts ?? []) as Department[]}
          initialContacts={(contacts ?? []) as AppUser[]}
        />
      </main>
    </>
  );
}
