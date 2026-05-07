// 사이트 하단 버전 표기. 배포할 때 두 상수만 손으로 바꿔주면 됨.
//   - VERSION: 정식 릴리스가 아니면 끝에 `*` 로 베타 마크
//   - RELEASE_DATE: 배포일을 MM.DD 로
const VERSION = "v.20*";
const RELEASE_DATE = "05.07";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-white py-3 text-center text-xs">
      <span className="text-stone-500">{VERSION}</span>
      <span className="ml-1.5 text-stone-400">({RELEASE_DATE})</span>
    </footer>
  );
}
