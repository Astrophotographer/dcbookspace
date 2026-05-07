/**
 * 한국 휴대폰 입력 자동 포맷.
 * 사용자가 0으로 시작하지 않으면 010 prefix 자동, 8자리 입력 시 010-1234-5678 형태로.
 *   - 숫자만 추출
 *   - 0으로 시작 안 함 → '010' 자동 부여
 *   - 11자리 초과 입력 잘라냄
 *   - 길이별 dash 위치
 */
export function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d[0] !== "0") d = "010" + d;
  d = d.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
