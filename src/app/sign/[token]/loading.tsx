// 결재 페이지 전용 로딩 — 어르신이 QR 스캔 직후 가장 먼저 보는 화면이라
// "확인 중..." 메시지로 신청 정보 fetch 중임을 명시한다.
export default function SignLoading() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-brand-700">장소사용 결재</h1>
      </header>
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-stone-200 bg-white p-10 text-center">
        <div
          aria-hidden
          className="h-12 w-12 animate-spin rounded-full border-4 border-stone-200 border-t-brand-600"
        />
        <p className="text-lg font-semibold text-stone-700">
          신청 정보 확인 중...
        </p>
      </div>
    </main>
  );
}
