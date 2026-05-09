import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { MobileApplyFab } from "@/components/mobile-apply-fab";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "등촌교회 장소사용신청",
  description: "등촌교회 장소사용 신청·결재 시스템",
  manifest: "/manifest.webmanifest",
  // iOS Safari "홈 화면에 추가" 시 standalone 앱처럼 떠오르도록.
  // title 은 홈 아이콘 아래 라벨로 노출 — 너무 길면 ... 으로 잘림(약 12자 권장).
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "등촌교회 장소신청",
  },
  // icons 는 src/app/icon.tsx · src/app/apple-icon.tsx 가 자동으로 link 태그
  // 주입하므로 metadata 에 직접 명시 안 함.
};

// 모바일 브라우저 주소창·노치 색을 시스템 테마와 통일.
export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        {children}
        {/* MobileApplyFab 가 usePathname 을 쓰므로 Suspense 안에 — prerender 안전성 */}
        <Suspense fallback={null}>
          <MobileApplyFab />
          <SiteFooter />
        </Suspense>
      </body>
    </html>
  );
}
