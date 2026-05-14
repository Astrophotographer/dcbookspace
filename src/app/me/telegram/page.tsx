import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { getDepartments } from "@/lib/repo";
import { getTelegramBotUsername } from "@/lib/telegram";
import { TelegramRegisterForm } from "./register-form";

export const metadata = {
  title: "텔레그램 알림 신청",
};

export default async function MeTelegramPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const sp = await props.searchParams;
  const prefillName = typeof sp.name === "string" ? sp.name : "";
  const prefillPhone = typeof sp.phone === "string" ? sp.phone : "";
  const [departments, botUsername] = await Promise.all([
    getDepartments(),
    getTelegramBotUsername(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[linear-gradient(90deg,rgba(11,111,112,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(11,111,112,0.05)_1px,transparent_1px),#f7f5ef] bg-[length:28px_28px]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-7">
          <TelegramRegisterForm
            departments={departments}
            botUsername={botUsername ?? ""}
            autoEnabled={!!botUsername}
            prefillName={prefillName}
            prefillPhone={prefillPhone}
          />
        </div>
      </main>
    </>
  );
}
