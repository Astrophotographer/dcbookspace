import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "./admin-session";

/**
 * 현재 요청 쿠키에 유효한 관리자 토큰이 들어 있는지.
 * BasicAuth 통과 → proxy.ts 가 쿠키 발급 → server component 가 이걸로 식별.
 */
export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  const t = c.get(ADMIN_COOKIE_NAME)?.value;
  if (!t) return false;
  return verifyAdminToken(t);
}
