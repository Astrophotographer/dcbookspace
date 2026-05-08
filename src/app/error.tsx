"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * 전역 에러 경계. 페이지 안에서 throw 된 에러를 잡아 친절한 fallback 표시.
 *
 *  - "use client" 필수: Next.js 가 client error boundary 로 다룸
 *  - reset() 호출하면 같은 segment 다시 시도 (transient 에러 회복용)
 *  - error.message 는 production 빌드에서 generic 텍스트로 교체될 수 있음 (Next.js 16 동작)
 *  - 에러 디지털 추적은 server logs / Vercel functions logs 에 자동 기록됨
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 운영 환경에선 Vercel logs 에 stack 이 자동 기록되지만, 콘솔에도 한번 남겨 두면
  // 사용자가 직접 신고할 때 브라우저 콘솔에서 같은 메시지를 가리킬 수 있음.
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <>
      {/* SiteHeader 가 server-only 의존성을 끌어오므로 client error boundary 에서 사용 불가.
          최소한의 헤더를 inline 으로 둔다 (홈 링크만). */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="등촌교회 홈"
          >
            <Image
              src="/deungchon-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-auto sm:h-10"
            />
            <span className="text-lg font-bold text-stone-900">등촌교회</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-10 w-10" strokeWidth={1.8} />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-stone-900 sm:text-3xl">
          일시적인 오류가 발생했습니다
        </h1>
        <p className="mb-2 max-w-md text-base leading-relaxed text-stone-600 sm:text-lg">
          잠깐의 통신 문제일 수 있어요. 아래 <strong>다시 시도</strong>를 먼저 눌러보세요.
        </p>
        {error.digest && (
          <p className="mb-6 text-xs text-stone-400">
            오류 코드: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-5 w-5" />
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-stone-300 bg-white px-6 text-base font-semibold text-stone-800 shadow-sm transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          >
            <Home className="h-5 w-5" />
            홈으로
          </Link>
        </div>
        <p className="mt-10 text-sm text-stone-500">
          반복해서 같은 오류가 뜨면 관리자에게 알려주세요 —{" "}
          <a
            href="tel:010-9654-5448"
            className="font-mono font-semibold text-brand-700 hover:underline"
          >
            010-9654-5448
          </a>
        </p>
      </main>
    </>
  );
}
