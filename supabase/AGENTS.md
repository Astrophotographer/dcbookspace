# Supabase 규칙

## 마이그레이션
- 파일명은 `NNNN_설명.sql` 4자리 순번. 기존 번호 재사용·수정 금지 — 항상 새 파일 추가
- 적용 순서가 곧 의미. 한 마이그레이션은 멱등하지 않아도 됨 (한 번만 실행되는 전제)
- 충돌 검증·신청번호 생성은 **DB trigger / RPC**로 처리. 앱 코드에서 race condition 막으려 하지 말 것

## Realtime
- 새 테이블이 클라이언트에서 구독돼야 하면 **반드시** publication 등록 마이그레이션을 함께 작성 (`0003_enable_realtime.sql` 패턴 참고)
- 빠뜨리면 다른 탭/기기 동기화가 조용히 안 됨

## PIN / 인증
- `users.pin_hash` 는 bcrypt. 평문 PIN을 DB에 절대 저장 금지
- 결재자 등록 시 휴대폰 뒷 4자리를 초기 PIN으로 자동 발급 (어르신 친화 트레이드오프)

## Status 값
- `reservations.status` enum은 DB 스키마. 화면 표시용 `결재대기중/결재진행중` 같은 derived 값을 enum에 추가하지 말 것
- `approvals.status='skipped'` 는 관리자가 강제 예약했을 때 미처리 단계 표시용

## 호실 좌표
- `rooms.map_x/y/w/h` 는 0~100% 비율 (px 아님). 화면 크기 무관하게 렌더되도록 유지
