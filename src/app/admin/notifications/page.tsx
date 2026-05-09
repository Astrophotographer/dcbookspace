import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { AdminPushPermissionPrompt } from "@/components/admin-push-permission-prompt";

/**
 * 관리자 알림 ON/OFF 페이지.
 *
 * 정책:
 *  - 사이트 로그인 자체로 "관리자 폰" 식별 — 어느 관리자(admin user) 인지는
 *    한 번만 선택받고 그 후로는 토글만 노출 (선택값은 localStorage 캐시).
 *  - 토글 ON  → 알림 권한 요청 + endpoint 등록 + DB 저장
 *  - 토글 OFF → DB 행 삭제 + 브라우저 unsubscribe
 *  - 같은 폰에서 다음 ON 시 같은 admin user 로 자동 재구독.
 */
export default async function AdminNotificationsPage() {
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
    .select("id, name, active")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  const adminLite = (admins ?? [])
    .filter((a) => a.active !== false)
    .map((a) => ({ id: a.id, name: a.name }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">관리자 알림</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            누군가 <strong>같은 시간·호실에 강제로 중복 신청</strong>을
            등록하면 이 폰으로 즉시 알림이 갑니다. 토글로 언제든 켜고 끌 수
            있어요.
          </p>
        </div>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <AdminPushPermissionPrompt admins={adminLite} />
        </section>

        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          <p className="mb-1 font-semibold text-stone-700">알아두기</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              알림은 <strong>이 폰</strong>(브라우저)에만 적용됩니다. 다른 폰에서
              받으려면 그 폰에서도 한 번 켜 주세요.
            </li>
            <li>
              iPhone 은 <strong>Safari → 공유 → 홈 화면에 추가</strong>로 PWA 설치
              후에만 알림이 옵니다 (iOS 16.4 이상).
            </li>
            <li>
              브라우저 알림이 차단된 상태면 토글이 비활성화돼요. 주소창 자물쇠
              → 알림 → 허용으로 변경 후 페이지 새로고침.
            </li>
          </ul>
        </div>
      </main>
    </>
  );
}
