// 관리자 BasicAuth 가 통과한 직후 발급되는 서명 쿠키 토큰.
// 미들웨어(Edge runtime) 와 server component(Node) 양쪽에서 모두 사용할 수 있도록
// node:crypto 가 아닌 WebCrypto(crypto.subtle) 를 쓴다. APPROVAL_SESSION_SECRET 을
// 결재자 5분 세션과 동일하게 재활용 — 비밀이 비어 있으면 graceful 비활성.

export const ADMIN_COOKIE_NAME = "dcb_admin";
const TTL_SECONDS = 24 * 60 * 60;
export const ADMIN_COOKIE_MAX_AGE = TTL_SECONDS;

export type AdminLoginSession =
  | { kind: "site_admin" }
  | { kind: "user"; userId: string; name: string; role: "elder" };

export type AdminSession =
  | { kind: "site_admin"; role: "admin"; expiresAt: number }
  | {
      kind: "user";
      userId: string;
      name: string;
      role: "elder";
      expiresAt: number;
    };

export function getAdminSecret(): string | null {
  const s = process.env.APPROVAL_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

function bytesToBase64Url(input: ArrayBuffer | Uint8Array): string {
  const a = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const std = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = std.length % 4 ? "=".repeat(4 - (std.length % 4)) : "";
  const bin = atob(std + pad);
  // crypto.subtle.verify 는 BufferSource(=ArrayBuffer | ArrayBufferView<ArrayBuffer>)
  // 를 요구하므로 ArrayBuffer 를 명시적으로 만들어 둔다 (TS 5.7 narrowing 이슈).
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stringToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

function base64UrlToString(s: string): string {
  return new TextDecoder().decode(base64UrlToBytes(s));
}

async function importKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

/**
 * 토큰 포맷: `<payloadBase64Url>.<sigBase64Url>`
 * payload 는 로그인 종류와 만료시각을 담은 JSON. payload 전체를 서명해
 * 담당장로 제한 세션도 Edge proxy 에서 DB 조회 없이 판별한다.
 */
export async function signAdminToken(
  secret: string,
  session: AdminLoginSession = { kind: "site_admin" },
): Promise<string> {
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const payload: AdminSession =
    session.kind === "user"
      ? { ...session, expiresAt }
      : { kind: "site_admin", role: "admin", expiresAt };
  const payloadB64 = stringToBase64Url(JSON.stringify(payload));
  const key = await importKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return `${payloadB64}.${bytesToBase64Url(sig)}`;
}

async function verifyLegacyAdminToken(
  expStr: string,
  sigB64: string,
  secret: string,
): Promise<AdminSession | null> {
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  try {
    const key = await importKey(secret, ["verify"]);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sigB64),
      new TextEncoder().encode(expStr),
    );
    return ok ? { kind: "site_admin", role: "admin", expiresAt: exp } : null;
  } catch {
    return null;
  }
}

function normalizeAdminSession(payload: unknown): AdminSession | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const expiresAt = Number(p.expiresAt);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  if (p.kind === "site_admin" && p.role === "admin") {
    return { kind: "site_admin", role: "admin", expiresAt };
  }

  if (
    p.kind === "user" &&
    p.role === "elder" &&
    typeof p.userId === "string" &&
    typeof p.name === "string"
  ) {
    return {
      kind: "user",
      userId: p.userId,
      name: p.name,
      role: "elder",
      expiresAt,
    };
  }

  return null;
}

export async function verifyAdminSession(
  token: string,
): Promise<AdminSession | null> {
  const secret = getAdminSecret();
  if (!secret) return null;
  const idx = token.indexOf(".");
  if (idx < 0) return null;
  const payloadB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);

  if (/^\d+$/.test(payloadB64)) {
    return verifyLegacyAdminToken(payloadB64, sigB64, secret);
  }

  try {
    const key = await importKey(secret, ["verify"]);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return null;
    return normalizeAdminSession(JSON.parse(base64UrlToString(payloadB64)));
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  return (await verifyAdminSession(token)) !== null;
}

export function isFullAdminSession(session: AdminSession | null): boolean {
  return session?.kind === "site_admin";
}

export function canAccessAdminPath(
  session: AdminSession,
  pathname: string,
): boolean {
  if (isFullAdminSession(session)) return true;
  if (session.role !== "elder") return false;

  if (pathname === "/admin") return true;
  if (pathname === "/admin/signs" || pathname.startsWith("/admin/signs/")) {
    return true;
  }
  if (pathname === "/admin/reservations") return true;
  if (
    pathname.startsWith("/admin/reservations/") &&
    pathname !== "/admin/reservations/new"
  ) {
    return true;
  }

  return false;
}
