import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "장소사용신청 | DCbookspace",
  description: "교회 장소사용신청·결재 시스템",
  manifest: "/manifest.webmanifest",
  // iOS Safari "홈 화면에 추가" 시 standalone 앱처럼 떠오르도록.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "장소사용신청",
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
        <SiteFooter />
      </body>
    </html>
  );
}
