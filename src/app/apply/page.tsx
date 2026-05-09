import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { ApplyForm } from "./apply-form";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBuildings,
  getFloors,
  getRooms,
  getDepartments,
} from "@/lib/repo";

/**
 * 키오스크 모드(?kiosk=1) 진입 시점에 manifest 를 키오스크 전용으로 오버라이드.
 *  - 그 페이지에서 "홈 화면에 추가" 누르면 키오스크 PWA 로 등록됨
 *  - manifest-kiosk 의 start_url 이 /apply?kiosk=1 이므로 다음 진입도 자동으로 키오스크 모드
 *
 * 일반 사용자(?kiosk 없음)는 root layout 의 manifest 그대로.
 */
export async function generateMetadata(
  props: PageProps<"/apply">,
): Promise<Metadata> {
  const sp = await props.searchParams;
  if (sp.kiosk !== "1") return {};
  return {
    title: "장소사용 신청 (키오스크)",
    manifest: "/manifest-kiosk.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "장소신청 키오스크",
    },
  };
}

export default async function ApplyPage(props: PageProps<"/apply">) {
  // 키오스크 모드 — ?kiosk=1 일 때 헤더·푸터 숨기고 신청 전용 화면.
  const sp = await props.searchParams;
  const isKiosk = sp.kiosk === "1";

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader kiosk={isKiosk} />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }

  const [buildings, floors, rooms, departments] = await Promise.all([
    getBuildings(),
    getFloors(),
    getRooms(),
    getDepartments(),
  ]);

  return (
    <>
      <SiteHeader kiosk={isKiosk} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <h1 className="mb-6 text-[28px] font-bold tracking-tight text-stone-900 sm:text-[34px]">
          장소사용 신청
        </h1>
        <ApplyForm
          buildings={buildings}
          floors={floors}
          rooms={rooms}
          departments={departments}
        />
      </main>
    </>
  );
}
