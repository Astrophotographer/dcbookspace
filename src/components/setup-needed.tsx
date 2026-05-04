export function SetupNeeded() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8">
        <h2 className="mb-3 text-xl font-bold text-amber-900">
          Supabase 설정이 필요합니다
        </h2>
        <p className="mb-4 text-stone-700">
          이 시스템을 실행하려면 Supabase 프로젝트와 환경변수 설정이 필요합니다.
        </p>
        <ol className="list-decimal space-y-2 pl-6 text-stone-700">
          <li>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline"
            >
              supabase.com
            </a>
            에서 프로젝트 생성
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-0.5">
              .env.local
            </code>
            파일에 URL과 키 입력
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-0.5">
              supabase/migrations/0001_initial_schema.sql
            </code>{" "}
            과
            <code className="ml-1 rounded bg-stone-100 px-1.5 py-0.5">
              0002_seed.sql
            </code>{" "}
            을 SQL Editor에서 실행
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-0.5">
              npm run dev
            </code>{" "}
            재시작
          </li>
        </ol>
      </div>
    </div>
  );
}
