"use client";

import { useSearchParams } from "next/navigation";

// 사이트 하단 버전 표기. 배포할 때 두 상수만 손으로 바꿔주면 됨.
//   - VERSION: 정식 릴리스가 아니면 끝에 `*` 로 베타 마크
//   - RELEASE_DATE: 배포일을 MM.DD 로
//
// 버전 컨벤션 (2026-05-08 재정리):
//   - 테스트 단계: v0.4* 부터 시작, 배포마다 0.5* → 0.6* → ... 로 +0.1
//   - 프로덕션 시작 선언 시: v1.0 부터 (정식 릴리스, `*` 제거)
//   - 프로덕션 후 마이너 배포: v1.0 → v1.1 → v1.2 ...
//   - 큰 변경: v2.0, v3.0 같이 메이저 점프
const VERSION = "v0.9*";
const RELEASE_DATE = "05.09";

export function SiteFooter() {
  // 키오스크 모드(?kiosk=1)에선 푸터 자체 숨김 — 사무실 태블릿 화면을 깔끔하게.
  // layout.tsx 에서 호출되어 searchParams 가 props 로 안 들어오므로 client hook
  // 으로 직접 읽음. SSR 시엔 useSearchParams 가 빈 객체라 일반 모드처럼 렌더되고
  // hydration 후 kiosk 면 사라지는 식 — 1프레임 깜빡임 정도는 수용 가능.
  const sp = useSearchParams();
  if (sp.get("kiosk") === "1") return null;

  return (
    // print 시에는 종이에 버전 도장이 찍히지 않도록 숨김 (사무실 인쇄 결재서류는 깔끔하게)
    <footer className="mt-auto border-t border-stone-200 bg-white py-3 text-center text-xs print:hidden">
      <span className="text-stone-500">{VERSION}</span>
      <span className="ml-1.5 text-stone-400">({RELEASE_DATE})</span>
    </footer>
  );
}
