type PageLoadingProps = {
  title?: string;
  subtitle?: string;
  maxWidthClassName?: string;
};

export function PageLoading({
  title = "잠시만 기다려주세요...",
  subtitle = "정보를 불러오는 중입니다",
  maxWidthClassName = "max-w-2xl",
}: PageLoadingProps) {
  return (
    <main
      className={`mx-auto flex min-h-[60vh] w-full ${maxWidthClassName} flex-col items-center justify-center px-4 py-12`}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          aria-hidden
          className="h-12 w-12 animate-spin rounded-full border-4 border-stone-200 border-t-brand-600"
        />
        <p className="text-lg font-semibold text-stone-700">{title}</p>
        {subtitle && <p className="text-base text-stone-500">{subtitle}</p>}
      </div>
    </main>
  );
}
