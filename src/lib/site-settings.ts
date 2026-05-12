import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

/**
 * site_settings 테이블의 사이트-와이드 설정을 읽고 쓰는 헬퍼.
 *
 * 캐싱: React `cache()` 로 요청 단위 메모이즈 — 같은 요청에서 여러 컴포넌트가
 * `getPrintEnabled()` 를 불러도 DB 쿼리는 1회만 발생.
 *
 * Graceful degrade: Supabase 미구성·테이블 없음·row 없음 모두 기본값(true) 반환.
 * → 마이그레이션 적용 전이나 setup 화면에서도 기존 동작이 깨지지 않도록.
 */

type SettingValues = {
  print_enabled: boolean;
};

const DEFAULTS: SettingValues = {
  print_enabled: true,
};

type SettingKey = keyof SettingValues;

async function readSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValues[K]> {
  if (!isSupabaseConfigured()) return DEFAULTS[key];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return DEFAULTS[key];
    // jsonb 컬럼은 supabase-js 가 이미 파싱된 값으로 돌려줌
    return data.value as SettingValues[K];
  } catch {
    return DEFAULTS[key];
  }
}

export const getPrintEnabled = cache(async (): Promise<boolean> => {
  const v = await readSetting("print_enabled");
  return v !== false;
});

/**
 * 서버 액션에서 호출. 토글 후 호출하는 쪽에서 revalidatePath 책임.
 */
export async function setSiteSetting<K extends SettingKey>(
  key: K,
  value: SettingValues[K],
): Promise<{ ok: true } | { error: string }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase 가 구성되지 않았습니다." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) return { error: error.message };
  return { ok: true };
}
