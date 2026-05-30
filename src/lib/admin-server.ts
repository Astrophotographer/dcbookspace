import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  isFullAdminSession,
  verifyAdminSession,
  type AdminSession,
} from "./admin-session";

/**
 * 현재 요청 쿠키에 유효한 관리자 토큰이 들어 있는지.
 * BasicAuth 통과 → proxy.ts 가 쿠키 발급 → server component 가 이걸로 식별.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const c = await cookies();
  const t = c.get(ADMIN_COOKIE_NAME)?.value;
  if (!t) return null;
  return verifyAdminSession(t);
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function isFullAdmin(): Promise<boolean> {
  return isFullAdminSession(await getAdminSession());
}
