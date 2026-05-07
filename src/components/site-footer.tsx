// 사이트 하단 버전 표기. 배포할 때 두 상수만 손으로 바꿔주면 됨.
//   - VERSION: 정식 릴리스가 아니면 끝에 `*` 로 베타 마크
//   - RELEASE_DATE: 배포일을 MM.DD 로
//
// 버전 컨벤션 (2026-05-07 갱신):
//   - 마이너 배포: v.NN* 의 NN 을 +1 (예: v.30* → v.31* → v.32* ...)
//   - 메이저 배포: v4.X* 형식으로 점프 (정식 릴리스 시 `*` 제거)
const VERSION = "v.31*";
const RELEASE_DATE = "05.08";

export function SiteFooter() {
  return (
    // print 시에는 종이에 버전 도장이 찍히지 않도록 숨김 (사무실 인쇄 결재서류는 깔끔하게)
    <footer className="mt-auto border-t border-stone-200 bg-white py-3 text-center text-xs print:hidden">
      <span className="text-stone-500">{VERSION}</span>
      <span className="ml-1.5 text-stone-400">({RELEASE_DATE})</span>
    </footer>
  );
}
