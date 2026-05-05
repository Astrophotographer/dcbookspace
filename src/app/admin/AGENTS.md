# /admin 규칙

## BasicAuth 보호
- `/admin/*` 의 모든 라우트와 **server action POST까지** Next.js 16 Proxy로 보호됨 ([proxy.ts](../../proxy.ts))
- 새 admin 라우트 추가해도 별도 가드 불필요 — 단, proxy matcher에서 빠지지 않게 확인
- `ADMIN_PASSWORD` env 비어있으면 503. 우회 코드 추가 금지

## 결재자 / PIN 관리
- 사용자 추가 시 **휴대폰 뒷 4자리가 자동 PIN** (bcrypt 해시 후 저장)
- PIN 재설정 UI는 운영자용. 평문 PIN을 화면에 표시할 때는 등록 직후 1회만

## 강제 예약 / 결재 취소
- 관리자가 강제 예약 시 미처리 결재 단계는 `approvals.status='skipped'`
- 결재 취소는 **당회장 전용** + 모든 단계 끝난 신청서만. 2단계 모달(확인 → PIN) 흐름 유지

## 호실 도면 편집
- 드래그앤드롭으로 `map_x/y/w/h` 조정. 0~100% 비율 (DB 규칙과 동일)
- 캔버스 크기 변해도 비율 그대로 저장되도록 변환 로직 깨지 말 것

## Realtime
- 관리자 화면은 Supabase Realtime 구독으로 다른 기기 변경을 즉시 반영. 새 mutation 추가 시 구독 핸들러도 함께 갱신
