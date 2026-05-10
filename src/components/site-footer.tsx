// 사이트 하단 버전 표기. 배포할 때 두 상수만 손으로 바꿔주면 됨.
//   - VERSION: 정식 릴리스가 아니면 끝에 `*` 로 베타 마크
//   - RELEASE_DATE: 배포일을 MM.DD 로
//
// 버전 컨벤션 (2026-05-08 재정리):
//   - 테스트 단계: v0.4* 부터 시작, 배포마다 0.5* → 0.6* → ... 로 +0.1
//   - 프로덕션 시작 선언 시: v1.0 부터 (정식 릴리스, `*` 제거)
//   - 프로덕션 후 마이너 배포: v1.0 → v1.1 → v1.2 ...
//   - 큰 변경: v2.0, v3.0 같이 메이저 점프
const VERSION = "v1.2*";
const RELEASE_DATE = "05.11";

export function SiteFooter() {
  return (
    // 키오스크/PWA 포함 모든 모드에서 노출. 사용자가 어떤 버전이 떠 있는지
    // 확인할 수 있어야 운영 디버그 시 도움이 됨.
    // print 시에만 종이에 안 찍히게 숨김 (결재 서류 깔끔하게).
    <footer className="mt-auto border-t border-stone-200 bg-white py-3 text-center text-xs print:hidden">
      <span className="text-stone-500">{VERSION}</span>
      <span className="ml-1.5 text-stone-400">({RELEASE_DATE})</span>
    </footer>
  );
}
