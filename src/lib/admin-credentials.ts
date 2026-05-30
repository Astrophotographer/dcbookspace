import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin, verifyPin } from "@/lib/auth"; // bcrypt 헬퍼 — 이름은 PIN 이지만 임의 길이 문자열에도 동작
import type { AdminLoginSession } from "@/lib/admin-session";

/**
 * 사이트 관리자 로그인 자격증명 검증.
 *
 * 정책: env 와 DB 둘 중 **하나라도** 일치하면 통과.
 *   - env (ADMIN_USERNAME / ADMIN_PASSWORD): 초기 시드 + 영구 비상 복구 키
 *   - DB (admin_credentials): 운영 중 web UI 에서 변경한 값
 *
 * env 가 비어 있으면 env 경로는 비활성. DB row 가 없으면 DB 경로는 비활성.
 * 둘 다 비어 있으면 누구도 로그인 못 함 (proxy.ts 의 503 폴백과 동일 방어).
 */
export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!username || !password) return false;

  // 1) env 일치 확인 — 비상 키
  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass && username === envUser && password === envPass) {
    return true;
  }

  // 2) DB hash 일치 확인
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_credentials")
    .select("password_hash")
    .eq("username", username)
    .maybeSingle();
  if (error || !data) return false;

  return verifyPin(password, data.password_hash);
}

/**
 * /admin/login 에서 사용하는 통합 로그인.
 * - 사이트 관리자: 기존 ADMIN_USERNAME/ADMIN_PASSWORD 또는 admin_credentials
 * - 담당장로: users.role='elder' 이고 이름이 ID, 휴대폰 뒷 4자리 PIN hash 가 비밀번호
 */
export async function authenticateAdminLogin(
  username: string,
  password: string,
): Promise<AdminLoginSession | null> {
  const trimmed = username.trim();
  if (!trimmed || !password) return null;

  if (await verifyAdminCredentials(trimmed, password)) {
    return { kind: "site_admin" };
  }

  const supabase = createServiceClient();
  const { data: elders, error } = await supabase
    .from("users")
    .select("id, name, role, pin_hash, active")
    .eq("name", trimmed)
    .eq("role", "elder")
    .eq("active", true)
    .not("pin_hash", "is", null);
  if (error || !elders?.length) return null;

  for (const elder of elders) {
    if (elder.pin_hash && (await verifyPin(password, elder.pin_hash))) {
      return {
        kind: "user",
        userId: elder.id,
        name: elder.name,
        role: "elder",
      };
    }
  }

  return null;
}

/**
 * web UI 에서 비밀번호 변경. 현재 비밀번호 검증 후 새 hash 로 upsert.
 * 첫 변경(=DB row 없음) 이면 insert, 이후엔 update.
 */
export async function updateAdminPassword(opts: {
  username: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ error?: string }> {
  const { username, currentPassword, newPassword } = opts;
  const trimmedUser = username.trim();

  if (!trimmedUser) return { error: "ID를 입력해 주세요." };
  if (!newPassword || newPassword.length < 4) {
    return { error: "새 비밀번호는 4자 이상이어야 합니다." };
  }

  // 현재 비밀번호 확인 — env 또는 DB 둘 중 하나라도 통과해야 함
  const ok = await verifyAdminCredentials(trimmedUser, currentPassword);
  if (!ok) return { error: "현재 비밀번호가 맞지 않습니다." };

  const supabase = createServiceClient();
  const newHash = await hashPin(newPassword);

  const { error } = await supabase
    .from("admin_credentials")
    .upsert(
      { username: trimmedUser, password_hash: newHash },
      { onConflict: "username" },
    );
  if (error) return { error: error.message };

  return {};
}
