// 사이트 하단 버전 표기. 배포할 때 두 상수만 손으로 바꿔주면 됨.
//   - VERSION: SemVer 형식 'vMAJOR.MINOR.PATCH[-dev]'
//   - RELEASE_DATE: 배포일을 MM.DD 로
//
// 버전 컨벤션 (2026-05-12 SemVer 적용):
//   - Major (1.x.x → 2.0.0): 이전 버전과 호환 안 되는 큰 변경 (API/DB 구조)
//   - Minor (1.0.x → 1.1.0): 새 기능 추가 (기존 호환 유지)
//   - Patch (1.0.0 → 1.0.1): 버그 수정·UX 다듬기
//   - develop 빌드: 끝에 '-dev' 붙임 → staging 임을 한눈에 (예: v1.1.1-dev)
//   - main 릴리스: '-dev' 제거 (예: v1.1.1)
const VERSION = "v1.2.0";
const RELEASE_DATE = "05.13";

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
