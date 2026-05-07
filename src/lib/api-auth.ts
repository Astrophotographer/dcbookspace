// 외부 API(`/api/v1/*`) 인증.
// Authorization: Bearer <EXTERNAL_API_TOKEN> 헤더 검증.
//
// 토큰은 Vercel Environment Variables 의 EXTERNAL_API_TOKEN 으로 관리.
// 16자 미만이면 자동 비활성(=모든 요청 401) — graceful guard.
//
// 비교는 timing-safe 로 (브루트포스로 한 글자씩 정답 추측 못 하도록).

export function verifyApiToken(req: Request): boolean {
  const expected = process.env.EXTERNAL_API_TOKEN;
  if (!expected || expected.length < 16) return false;

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();

  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 라우트 핸들러 시작부에서 짧게 호출하는 가드.
 * 토큰 불일치면 401 응답을 직접 반환한다.
 */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "WWW-Authenticate": "Bearer",
    },
  });
}
