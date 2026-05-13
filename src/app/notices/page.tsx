import { SiteHeader } from "@/components/site-header";
import { NoticeBoard } from "@/components/notice-board";

export const metadata = {
  title: "공지사항",
};

export default function NoticesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">공지사항</h1>
        <NoticeBoard />
      </main>
    </>
  );
}
