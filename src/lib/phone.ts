/**
 * 한국 휴대폰 입력 자동 포맷.
 * 숫자만 추출해 010-XXXX-YYYY 형태(3-4-4)로 다듬는다.
 *   - 0으로 시작 안 함 → '010' 자동 부여
 *   - 11자리 초과 잘라냄
 *   - 7자리(가운데 4자리 완성) 시점부터 trailing `-` 자동 부착 → 사용자가 dash 직접 입력 안 해도 됨
 *   - prev(이전 포맷 결과)를 넘기면, trailing `-` 만 백스페이스로 지운 케이스에서 마지막 숫자까지
 *     함께 떨어뜨려 boomerang 으로 갇히지 않게 처리
 */
export function formatPhone(raw: string, prev?: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d[0] !== "0") d = "010" + d;
  d = d.slice(0, 11);

  // 백스페이스로 trailing `-` 만 지웠다면 마지막 숫자도 함께 제거.
  // (그렇게 하지 않으면 7자리 → trailing dash 자동 부착 → 다시 같은 길이가 되어 갇힘)
  if (
    prev !== undefined &&
    prev.endsWith("-") &&
    raw.length === prev.length - 1 &&
    !raw.endsWith("-") &&
    d.length === 7
  ) {
    d = d.slice(0, 6);
  }

  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3, 7)}-`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
