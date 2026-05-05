import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

// 결재자가 PIN 인증에 성공하면 5분짜리 cookie 토큰을 발급한다.
// 같은 휴대폰으로 5분 안에 다른 QR 을 스캔하면 PIN 입력 없이 즉시 본인 단계가 자동 승인된다.
//
// 보안 트레이드오프:
// - 휴대폰을 잠시 두면 5분 안에 타인이 다른 QR 로 무단 승인 가능. 운영 정책으로 안내.
// - 마스터 키 0000 은 본 세션 대상 제외 (운영자 비상용은 1건만 처리되도록).
// - 본인 단계가 아닌 경우 자동 승인하지 않고 일반 안내 흐름으로 이동.
//
// APPROVAL_SESSION_SECRET 가 비어 있으면 자동 세션 자체가 비활성화되어 평소 흐름만 동작.
// (개발 환경에서 시크릿 없을 때 graceful degrade)

const COOKIE_NAME = "approver_session";
const TTL_SECONDS = 5 * 60;

function getSecret(): string | null {
  const s = process.env.APPROVAL_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

function sign(userId: string, expiresAt: number, secret: string): string {
  const payload = `${userId}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(
  token: string,
  secret: string,
): { userId: string; expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${userId}.${expStr}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId, expiresAt: exp };
}

export async function setApproverSessionCookie(userId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const token = sign(userId, expiresAt, secret);
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/sign",
    maxAge: TTL_SECONDS,
  });
}

export async function readApproverSession(): Promise<{ userId: string } | null> {
  const secret = getSecret();
  if (!secret) return null;
  const c = await cookies();
  const t = c.get(COOKIE_NAME)?.value;
  if (!t) return null;
  const v = verify(t, secret);
  return v ? { userId: v.userId } : null;
}
