import { NextRequest, NextResponse } from "next/server";

/**
 * /admin/* 경로(서브 페이지 + server action 호출 포함)를 BasicAuth로 보호한다.
 * 환경변수 ADMIN_USERNAME / ADMIN_PASSWORD 두 개를 등록해야 동작.
 *
 * Vercel: Project Settings → Environment Variables 에 추가하고 재배포.
 * 로컬: .env.local 에 추가 후 dev 서버 재시작.
 */
const REALM = 'Basic realm="Admin Area", charset="UTF-8"';

export function middleware(req: NextRequest) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return new NextResponse(
      "ADMIN_USERNAME / ADMIN_PASSWORD 환경변수가 설정되지 않아 관리 페이지를 보호할 수 없습니다.",
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const idx = decoded.indexOf(":");
      const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
      const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("관리자 인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export const config = {
  // /admin 자체 + 모든 서브경로 (서브경로의 POST도 매칭되어 server action 보호됨)
  matcher: ["/admin", "/admin/:path*"],
};
