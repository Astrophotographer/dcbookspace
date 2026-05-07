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
    title: "DCbookspace",
  },
  icons: {
    // PNG 한 장으로 desktop·iOS·Android 다 커버 (이상적이진 않지만 추가 자산
    // 만들기 전 임시. 추후 192/512 별도 png 만들어 대체).
    icon: "/deungchon-logo.png",
    apple: "/deungchon-logo.png",
  },
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
