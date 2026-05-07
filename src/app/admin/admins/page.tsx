import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/supabase/types";
import { AdminsAdmin } from "./admins-admin";
import { SitePasswordForm } from "./site-password-form";

export default async function AdminAdminsPage() {
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
  const supabase = createServiceClient();
  const { data: admins } = await supabase
    .from("users")
    .select("*")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  // 폼 기본 username — env 값(없으면 빈값)
  const defaultUsername = process.env.ADMIN_USERNAME ?? "";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-6">
        <h1 className="text-2xl font-bold">관리자 정보</h1>

        {/* 사이트 로그인 비밀번호 (BasicAuth 대체 — 쿠키 세션) */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-stone-900">
            사이트 로그인 비밀번호
          </h2>
          <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600">
            관리자 페이지(/admin) 진입에 사용되는 ID/비밀번호입니다.
            비밀번호를 잊었다면{" "}
            <a
              href="tel:010-9654-5448"
              className="font-mono font-semibold text-brand-700 hover:underline"
            >
              010-9654-5448
            </a>
            로 연락주세요.
          </p>
          <SitePasswordForm defaultUsername={defaultUsername} />
        </section>

        {/* 결재용 관리자 사용자 (PIN 발급) */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-stone-900">
            관리자 명단 (PIN)
          </h2>
          <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600">
            관리자는 <strong>휴대폰 뒷 4자리</strong>가 마스터 PIN 으로
            발급되며, 어떤 결재 단계든 강제 승인할 수 있습니다. 비상용 마스터
            키
            <span className="mx-1 rounded bg-stone-100 px-1.5 py-0.5 font-mono">
              0000
            </span>
            은 코드에 별도로 유지됩니다.
          </p>
          <AdminsAdmin initialAdmins={(admins ?? []) as AppUser[]} />
        </section>
      </main>
    </>
  );
}
