// SSR 데이터 fetch 동안 표시되는 전역 폴백.
// Vercel cold start 시 어르신이 빈 화면 보지 않도록 한다.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          aria-hidden
          className="h-12 w-12 animate-spin rounded-full border-4 border-stone-200 border-t-brand-600"
        />
        <p className="text-lg font-semibold text-stone-700">
          잠시만 기다려주세요...
        </p>
        <p className="text-base text-stone-500">정보를 불러오는 중입니다</p>
      </div>
    </main>
  );
}
