import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { getNotices } from "@/lib/repo";
import { NoticesAdmin } from "./notices-admin";

// 0028 마이그레이션 적용 전 환경에서도 prerender 실패하지 않도록 동적 렌더링.
export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
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

  const notices = await getNotices({ includeInactive: true });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-3 text-sm text-stone-500">
          <Link href="/admin" className="hover:underline">
            ← 관리
          </Link>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">공지관리</h1>
        <p className="mb-6 text-sm text-stone-600">
          공지사항 페이지에 표시할 글을 제목과 내용으로 등록합니다.
        </p>
        <NoticesAdmin initialNotices={notices} />
      </main>
    </>
  );
}
