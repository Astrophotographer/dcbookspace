import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

/**
 * 전역 404 페이지. 어느 라우트든 일치 안 하면 여기로.
 *  - 어르신 친화: 큰 아이콘 + 큰 글자 + 큰 버튼 (44px+)
 *  - 무엇이 잘못됐는지·어디로 갈 수 있는지 명확히
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <FileQuestion className="h-10 w-10" strokeWidth={1.8} />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-stone-900 sm:text-3xl">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mb-8 max-w-md text-base leading-relaxed text-stone-600 sm:text-lg">
          입력하신 주소가 잘못됐거나, 신청서가 삭제됐을 수 있습니다.
          홈으로 돌아가서 다시 시작해 주세요.
        </p>
        <Link
          href="/"
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <Home className="h-5 w-5" />
          홈으로
        </Link>
      </main>
    </>
  );
}
