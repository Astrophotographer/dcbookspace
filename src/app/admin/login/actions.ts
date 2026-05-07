"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminCredentials } from "@/lib/admin-credentials";
import {
  ADMIN_COOKIE_MAX_AGE,
  ADMIN_COOKIE_NAME,
  getAdminSecret,
  signAdminToken,
} from "@/lib/admin-session";

/**
 * /admin/login 폼 submit 시 호출. 검증 통과하면 admin 쿠키 발급 후 next 로 redirect.
 * 실패는 검색 파라미터로 페이지에 에러 표시.
 */
export async function loginAdmin(fd: FormData): Promise<void> {
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/admin");
  // open redirect 방어: 로컬 경로(/...) 만 허용
  const safeNext = /^\/[^/]/.test(next) ? next : "/admin";

  const ok = await verifyAdminCredentials(username, password);
  if (!ok) {
    redirect(
      `/admin/login?error=invalid&next=${encodeURIComponent(safeNext)}`,
    );
  }

  const secret = getAdminSecret();
  if (!secret) {
    redirect("/admin/login?error=secret");
  }

  const token = await signAdminToken(secret);
  const c = await cookies();
  c.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });

  redirect(safeNext);
}
