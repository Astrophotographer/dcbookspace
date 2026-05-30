import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { isAdmin } from "@/lib/admin-server";
import { loginAdmin } from "./actions";

type SP = { error?: string; next?: string };

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "아이디 또는 비밀번호가 맞지 않습니다.",
  secret:
    "서버에 APPROVAL_SESSION_SECRET 가 설정되지 않아 로그인할 수 없습니다.",
};

export default async function AdminLoginPage(props: {
  searchParams: Promise<SP>;
}) {
  // 이미 로그인 상태면 next 또는 /admin 으로 점프 — 폼 다시 보여주지 않음.
  const sp = await props.searchParams;
  if (await isAdmin()) {
    redirect(sp.next || "/admin");
  }

  const errorKey = sp.error ?? "";
  const errorMsg = ERROR_MESSAGES[errorKey] ?? null;
  const nextPath = sp.next ?? "/admin";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-stone-900">관리자 로그인</h1>
          <p className="mt-1 text-sm text-stone-500">
            관리자 ID 또는 담당장로 이름과 비밀번호를 입력해주세요.
          </p>

          {errorMsg && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errorMsg}
            </div>
          )}

          <form action={loginAdmin} className="mt-5 space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <Field label="아이디">
              <Input
                name="username"
                required
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="비밀번호">
              <Input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              로그인
            </Button>
          </form>

          <p className="mt-5 text-xs leading-relaxed text-stone-400">
            비밀번호를 잊었다면{" "}
            <a
              href="tel:010-9654-5448"
              className="font-medium text-stone-600 underline-offset-2 hover:underline"
            >
              010-9654-5448
            </a>
            로 연락주세요.
          </p>
        </div>
      </main>
    </>
  );
}
