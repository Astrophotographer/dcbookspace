import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  getAdminSecret,
  verifyAdminToken,
} from "@/lib/admin-session";

/**
 * /admin/* 경로(서브 페이지 + server action 호출 포함) 보호.
 *
 * 인증 방식: 쿠키 세션.
 *   - /admin/login (로그인 페이지) 자체와 그 server action POST 는 인증 면제
 *   - 그 외 /admin/* 는 dcb_admin 쿠키가 유효해야 진입 가능
 *   - 미인증이면 /admin/login?next=<원래경로> 으로 redirect
 *
 * APPROVAL_SESSION_SECRET 미설정 시 503 — 실수 보호 가드(env 비우면
 * 모든 사람이 로그인 통과 같은 사고 방지).
 */

export async function proxy(req: NextRequest) {
  const secret = getAdminSecret();
  if (!secret) {
    return new NextResponse(
      "APPROVAL_SESSION_SECRET 환경변수가 설정되지 않아 관리 페이지를 보호할 수 없습니다. (16자 이상 임의 문자열을 설정하세요)",
      { status: 503 },
    );
  }

  const { pathname } = req.nextUrl;

  // 로그인 페이지 자체와 그 액션은 인증 우회
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token && (await verifyAdminToken(token))) {
    return NextResponse.next();
  }

  // 미인증 → 로그인으로 redirect (next 에 원래 가려던 경로 보존)
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = `?next=${encodeURIComponent(pathname + (req.nextUrl.search ?? ""))}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // /admin 자체 + 모든 서브경로 (서브경로의 POST도 매칭되어 server action 보호됨)
  matcher: ["/admin", "/admin/:path*"],
};
