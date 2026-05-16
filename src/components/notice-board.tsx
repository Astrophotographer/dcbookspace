import Link from "next/link";
import { Megaphone } from "lucide-react";
import { getNotices } from "@/lib/repo";
import type { Notice } from "@/lib/supabase/types";

const TELEGRAM_NOTICE_LINK_RE = /(\(?\s*추후\s*안내\s*(?:예정)?\s*\)?)/g;
const TELEGRAM_NOTICE_LINK_PART_RE = /^\(?\s*추후\s*안내\s*(?:예정)?\s*\)?$/;

/**
 * 현황판 좌측의 공지사항 탭 콘텐츠.
 * DB 의 `notices` 테이블에서 active=true 인 공지만 보여준다.
 */
export async function NoticeBoard() {
  const notices = await getNotices();

  return (
    <div className="space-y-3">
      <UserFlowNoticeCard />
      {notices.map((n) => <NoticeCard key={n.id} notice={n} />)}
    </div>
  );
}

function UserFlowNoticeCard() {
  return (
    <Link
      href="/notices/user-flow"
      className="block rounded-2xl border border-brand-200 bg-white p-5 shadow-sm transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <article>
        <header className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-900 ring-1 ring-brand-300">
            <Megaphone className="h-3 w-3" aria-hidden />
            안내
          </span>
        </header>
        <h3 className="mb-1.5 text-lg font-bold text-stone-900">사용방법</h3>
        <p className="text-base leading-relaxed text-stone-700">
          장소사용 신청부터 결재까지 전체 흐름을 확인합니다.
        </p>
      </article>
    </Link>
  );
}

function NoticeCard({ notice }: { notice: Notice }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        {notice.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
            <Megaphone className="h-3 w-3" aria-hidden />
            중요
          </span>
        )}
        <span className="text-xs text-stone-500">
          {notice.published_at.slice(0, 10)}
        </span>
      </header>
      <h3 className="mb-1.5 text-lg font-bold text-stone-900">{notice.title}</h3>
      <div className="whitespace-pre-line text-base leading-relaxed text-stone-700">
        {renderNoticeBody(notice.body)}
      </div>
    </article>
  );
}

function renderNoticeBody(body: string) {
  const parts = body.split(TELEGRAM_NOTICE_LINK_RE);

  return parts.map((part, index) => {
    if (TELEGRAM_NOTICE_LINK_PART_RE.test(part)) {
      return (
        <Link
          key={`${part}-${index}`}
          href="/me/telegram"
          className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          등록하기
        </Link>
      );
    }
    return part;
  });
}
