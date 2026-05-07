"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME } from "./admin-session";

/**
 * "관리자 모드 끄기" — 발급된 admin 쿠키를 지운다.
 * BasicAuth 자체는 브라우저가 캐싱하므로 다시 `/admin` 누르면 자동 재인증되며
 * 새 쿠키가 발급된다. 즉 여기선 시각적·기능적 admin 표시만 끄는 의미.
 * 완전히 logout 하려면 사용자가 브라우저 캐시 비우거나 창 닫는 것이 정석.
 */
export async function adminLogout(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE_NAME);
  redirect("/");
}
