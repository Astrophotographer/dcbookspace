import { SiteHeader } from "@/components/site-header";
import { ComingSoon } from "@/components/coming-soon";

export default function AdminRoutesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">결재선 관리</h1>
        <ComingSoon
          note="기본/대규모 결재선은 시드에 포함되어 있습니다. 단계 추가/제거가 필요하면 Supabase Studio에서 approval_routes 테이블을 편집하세요."
        />
      </main>
    </>
  );
}
