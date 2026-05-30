import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { getDepartments } from "@/lib/repo";
import {
  getDiscordBotUsername,
  getDiscordInviteUrl,
} from "@/lib/discord";
import { DiscordRegisterForm } from "./register-form";

export const metadata = {
  title: "디스코드 알림 신청",
};

export default async function MeDiscordPage(props: {
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
    getDiscordBotUsername(),
  ]);
  const inviteUrl = getDiscordInviteUrl();

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[linear-gradient(90deg,rgba(37,99,235,0.055)_1px,transparent_1px),linear-gradient(0deg,rgba(37,99,235,0.055)_1px,transparent_1px),#f7f5ef] bg-[length:28px_28px]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-7">
          <DiscordRegisterForm
            departments={departments}
            botUsername={botUsername ?? ""}
            inviteUrl={inviteUrl ?? ""}
            autoEnabled={!!botUsername}
            prefillName={prefillName}
            prefillPhone={prefillPhone}
          />
        </div>
      </main>
    </>
  );
}
