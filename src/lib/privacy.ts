/**
 * 개인정보 마스킹 헬퍼.
 * 관리자가 아닌 사용자가 신청 목록·상세 등 공개 뷰에서 볼 때 적용.
 * 관리자(쿠키 인증 통과)는 원본 그대로.
 */

/**
 * 이름 마스킹: 첫 글자만 남기고 나머지를 `*` 로.
 *   "홍길동"   → "홍**"
 *   "김홍길동" → "김***"
 *   "X"        → "X" (한 글자는 그대로)
 *   ""         → ""
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return "";
  const t = name.trim();
  if (t.length <= 1) return t;
  return t[0] + "*".repeat(t.length - 1);
}

/**
 * 휴대폰 마지막 4자리 마스킹.
 *   "010-1234-5678" → "010-1234-****"
 *   "01012345678"   → "0101234****"
 *   하이픈 유무 무관 — 끝 4자리 숫자만 별표.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\d{4}$/, "****");
}
