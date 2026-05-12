-- =====================================================
-- 사이트-와이드 설정 저장소
-- =====================================================
-- 어드민이 런타임에 토글할 수 있는 사이트 전체 설정을 한 곳에 보관.
-- key-value(jsonb) 구조라 새 설정이 생길 때마다 row insert 로 확장 가능.
-- 첫 사용: 'print_enabled' — 신청 시 자동 인쇄·관련 UI 일괄 ON/OFF.

create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거
create or replace function touch_site_settings_updated_at()
returns trigger as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_site_settings_touch on site_settings;
create trigger trg_site_settings_touch
  before update on site_settings
  for each row execute function touch_site_settings_updated_at();

-- 시드: 프린트는 기본 ON (마이그레이션 적용 직후 기존 동작 그대로)
insert into site_settings (key, value)
values ('print_enabled', 'true'::jsonb)
on conflict (key) do nothing;
