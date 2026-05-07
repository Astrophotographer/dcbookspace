// 관리자 BasicAuth 가 통과한 직후 발급되는 서명 쿠키 토큰.
// 미들웨어(Edge runtime) 와 server component(Node) 양쪽에서 모두 사용할 수 있도록
// node:crypto 가 아닌 WebCrypto(crypto.subtle) 를 쓴다. APPROVAL_SESSION_SECRET 을
// 결재자 5분 세션과 동일하게 재활용 — 비밀이 비어 있으면 graceful 비활성.

export const ADMIN_COOKIE_NAME = "dcb_admin";
const TTL_SECONDS = 24 * 60 * 60;
export const ADMIN_COOKIE_MAX_AGE = TTL_SECONDS;

export function getAdminSecret(): string | null {
  const s = process.env.APPROVAL_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

function bytesToBase64Url(buf: ArrayBuffer): string {
  const a = new Uint8Array(buf);
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
 * 토큰 포맷: `<expiresAtMs>.<sigBase64Url>`
 * payload 는 expiresAtMs 그 자체 — 단순하지만 위조 시 타임스탬프와 서명이 동시에
 * 변조 안 되는 한 통과 못함.
 */
export async function signAdminToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const key = await importKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiresAt)),
  );
  return `${expiresAt}.${bytesToBase64Url(sig)}`;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret) return false;
  const idx = token.indexOf(".");
  if (idx < 0) return false;
  const expStr = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  try {
    const key = await importKey(secret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sigB64),
      new TextEncoder().encode(expStr),
    );
  } catch {
    return false;
  }
}
