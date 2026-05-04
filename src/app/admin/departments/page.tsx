import { SiteHeader } from "@/components/site-header";
import { ComingSoon } from "@/components/coming-soon";

export default function AdminDeptsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">부서 관리</h1>
        <ComingSoon
          note="부서 관리는 현재 supabase/migrations/0002_seed.sql 의 시드 또는 Supabase Studio 에서 직접 편집해 주세요. 곧 UI를 추가합니다."
        />
      </main>
    </>
  );
}
