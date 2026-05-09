import type { Metadata } from "next";

/**
 * 키오스크 전용 PWA 설치 라우트.
 *
 * 이 layout 안의 페이지에서만 manifest 가 manifest-kiosk.webmanifest 로 오버라이드된다.
 *  - start_url: /apply?kiosk=1  → 설치 후 앱 아이콘 누르면 키오스크 모드로 바로 진입
 *  - display: fullscreen        → 풀스크린 (Android 지원, iOS 는 standalone 폴백)
 *
 * 일반 사용자용 PWA 설치 흐름과 분리하기 위해 라우트 격리.
 */
export const metadata: Metadata = {
  title: "키오스크 설치 — 등촌교회 장소신청",
  manifest: "/manifest-kiosk.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "장소신청 키오스크",
  },
};

export default function KioskInstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
