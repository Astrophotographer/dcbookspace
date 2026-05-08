# DCbookspace — 교회 장소 사용 신청·결재 시스템 PRD

| 항목 | 값 |
|---|---|
| 프로젝트명 | DCbookspace |
| 버전 | 1.0 (운영 가능) |
| 최초 배포 | 2026-05 |
| Repo | github.com/Astrophotographer/dcbookspace |
| Production | dcbookspace.vercel.app |

---

## 1. 개요

교회 시설(예배실·교육실·회의실 등)의 사용 신청과 다단계 결재를 디지털화하는 시스템. 종이 양식 + 도장 회람 흐름을 그대로 보존하면서 **종이 분실·정체·중복 신청** 같은 운영 마찰을 제거한다.

**미션**: *"종이 신청서를 없애되, 어르신 결재자가 추가 학습 없이 그대로 쓸 수 있어야 한다."*

---

## 2. 배경 — 풀려는 문제

기존 종이 흐름의 5가지 페인포인트:

1. **결재 진행도 추적 불가** — 신청서가 어느 책상에 있는지 알 수 없음
2. **결재자 한 분 부재 시 며칠씩 정체** — 우회 수단 없음
3. **동일 시간·호실 중복 발견 못 함** — 행사 당일에야 충돌 확인
4. **빈 시간/호실이 한 눈에 안 보임** — 사무실에 전화로 확인
5. **신청자 결과 확인 불가** — 사무실까지 가야 진행 상황 알 수 있음

추가 제약: **사용자 평균 연령 60대 후반**. 회원가입/비밀번호 학습 비용을 감수할 수 없음.

---

## 3. 목표 / 비목표

### Goals
- G1. 신청부터 최종 확정까지 종이 없이 진행
- G2. 결재 진행 상태를 신청자·결재자·운영자가 실시간 공유
- G3. 회원가입 / 비밀번호 / 앱 설치 모두 없이 동작
- G4. 호실·시간 충돌을 신청 시점에 즉시 감지 + 빈 시간 추천
- G5. 운영자가 결재자 부재·긴급 행사에 강제로 끼어들 수 있는 비상 경로 보장

### Non-goals
- 외부 시설 예약 (교회 내부 시설만)
- 회계/유료 결제 연동
- 일반 신자용 회원 페이지 (마이페이지 등)
- 다국어 지원

---

## 4. 사용자 페르소나

| 페르소나 | 비중 | 디지털 친숙도 | 핵심 동작 |
|---|---|---|---|
| 신청자 (각 부서) | 다수 | 중간 | `/apply` 폼 작성 → QR/링크 받아서 결재 회람 |
| 결재자 (부서장·관리장로·차장·당회장) | 10~20명 | **낮음 (60+ 다수)** | QR 스캔 → PIN 4자리 입력 → 승인/반려 |
| 운영자 (사무처) | 1~3명 | 중상 | `/admin/*` 에서 모든 데이터 관리 + 비상 강제 승인 |
| 관리자 (마스터 PIN 보유자) | 2~3명 | 중간 | 어떤 결재 단계든 강제 승인 가능 |

---

## 5. 핵심 사용자 흐름

### 5-1. 일회성 신청
```
신청자: /apply 진입 → 부서·호실·일시·목적 입력
  ↓ 충돌 검사 (실시간)
  ├─ 빈 시간이면 그대로 제출
  ├─ 충돌 시: 모달에 [기존 일정 + 그날 빈 시간대] 표시
  │            → "그래도 신청" or "취소"
  ↓
신청서 1장 발급 (ref_no = "26-0042" 형식 + QR 토큰 1개)
  ↓
인쇄 회람 or 카톡 링크 전달
  ↓
결재자별로 QR 스캔 → /sign/[token]
  ├─ PIN 4자리 입력 (휴대폰 뒷자리)
  │   ├─ 본인 단계와 매칭되면 자동 승인
  │   ├─ 5분 안에 다른 QR 스캔 시 PIN 없이 자동 결재
  │   └─ admin role PIN 또는 0000 → 어떤 단계든 강제 승인
  └─ 모든 단계 승인 → status='approved' 확정
```

### 5-2. 정기(시리즈) 신청
- 매주 같은 요일·시간대 반복 (예: 매주 일요일 오후 2시 1청년회 모임)
- 시작일·종료일 + 요일 + 시간 블록 입력 → 회차 자동 생성 (`reservation_series` + 하위 `reservations`)
- 결재 1회로 시리즈 전체 확정

### 5-3. 신청 수정/취소 (신청자)
- **1단계 결재 시작 전**까지만 본인 수정·삭제 가능
- 본인 인증: 신청 시 입력한 휴대폰 번호 매칭

### 5-4. 결재 취소 (당회장 권한)
- 모든 단계 끝난 신청서를 다시 검토하고 싶을 때
- 당회장 PIN으로 취소 → 모든 approval 초기화 + reservation status='pending'

### 5-5. 운영자 비상 경로
- 마스터 키 `0000` (비상용, 코드 하드코딩)
- 관리자 PIN (`role='admin'` 사용자, 휴대폰 뒷 4자리)
- 강제 예약 (결재 우회 즉시 확정)
- 신청서 삭제

---

## 6. 기능 요구사항

### 6-1. 신청 폼 (`/apply`)
- 부서 cascading select (대분류 → 소분류, 약 62개 leaf)
- 호실 cascading (건물 → 층 → 호실)
- 일회성 / 정기 토글
- 휴대폰 자동 포맷 (`010-1234-5678`)
- 날짜 자동 포맷 + 월/일 범위 자동 보정 (윤년 반영)
- 충돌 검사 + 빈 시간대 추천 + 강제 진행 옵션
- 고정 행사(주일 예배 등) 충돌도 함께 감지

### 6-2. 결재 화면 (`/sign/[token]`)
- QR 토큰 1개로 모든 단계 공유
- PIN 4자리 (`bcrypt` 해시)
- 5분 자동 세션 쿠키 (휴대폰 분실 트레이드오프 안내)
- PIN 오답 시 0.45초 흔들림 + 빨간 강조 + 즉시 비움
- 1차 안내 화면 → PIN 입력 → 결과 화면
- 토큰 만료/이미 처리됨 등 에러 케이스 명확

### 6-3. 현황 보기 (`/`)
- **날짜별** (캘린더 6주 그리드): 마우스 휠 ±7일, 모바일 스와이프, 일/토 색 강조, 짝수달 배경
- **장소별** (건물 평면도): 호실 좌표 도면, 점유 상태 색·아이콘·텍스트, 그리드 폴백
- 두 뷰 토글 + 좌우 스와이프 + 세션 기억

### 6-4. 신청 목록 (`/reservations`, `/admin/reservations`)
- 정렬: 신청번호·작성일·부서·장소·사용일시·상태·결재 라인
- 결재 라인 정렬: 마지막 통과 단계 기준 (당회장 → 관리장로 → 차장 → 부서장 → 대기)
- 검색: 신청번호·부서명·신청자명 통합 (대시·#·공백 무시)
- 충돌 그룹 번호 칩 (색약 사용자 대응)
- 페이지네이션 10/50/100

### 6-5. 관리자 (`/admin/*`)
- 쿠키 세션 로그인 + DB-stored 비밀번호 (env 비상 키 영구 유효)
- 신청서 관리 (강제 확정·삭제·결재 취소)
- 결재자 관리 (PIN 발급, 신청 이력 있으면 soft delete + PIN 무효화)
- 관리자 정보 (다중 마스터 PIN, 최소 1명 보장 — 시드 "홍길동")
- 부서 트리 관리 (그룹 좌측 탭, leaf 드래그앤드롭 순서 변경)
- 호실 관리 (건물·층·호실, 도면 좌표 드래그앤드롭 + 리사이즈)
- 고정 행사 (주일 예배 등 매주 정기)
- 인쇄 진행 상태 (사무실 프린터 연동)

---

## 7. 비기능 요구사항

### 7-1. UX (어르신 친화 — 절대 원칙)
- 루트 폰트 17px (Tailwind 기본 16px 아님)
- 모든 터치 타겟 44px 이상
- **상태 표시는 색 단독 금지** — 항상 색 + 아이콘 + 텍스트 다중 신호
- 모달은 최소화. 버튼 라벨은 동작 그대로 ("결재 취소", "강제 승인" 등 — "확인" 금지)
- 입력값 검증은 거부가 아니라 자동 보정 우선

### 7-2. 보안 불변식
- `/admin/*` 쿠키 세션 인증 (server action POST 포함, `/admin/login` 만 면제)
- `APPROVAL_SESSION_SECRET` 빈 값이면 503 (실수로 보호 풀린 채 배포 방지)
- 비상용 `ADMIN_PASSWORD` env 키는 영구 유효 — 운영 비밀번호 분실 시 우회 로그인용
- `SUPABASE_SERVICE_ROLE_KEY` 서버 전용
- 마스터 키 `0000` 코드 하드코딩 유지 (비상용)
- PIN은 bcrypt 해시. 평문 DB 저장 금지

### 7-3. 성능
- 홈 페이지 TTFB < 1초 (Suspense streaming + cache 메모화)
- 달력 네비 시각 피드백 (useTransition isPending opacity)
- BuildingView dynamic import (탭 진입까지 ~30~40KB 절약)
- DB 인덱스: `reservations(start_at, end_at)` 부분 인덱스, `reservation_series(created_at desc)`
- master fetch 함수 React `cache()` 래핑

### 7-4. Realtime
- 관리자 / 신청 상세 페이지: rooms · reservations · approvals 구독
- 홈은 조회 전용이라 구독 없음

---

## 8. 시스템 아키텍처

```
[브라우저]
  ├─ Next.js 16 (App Router, Turbopack)
  ├─ React 19 server/client component
  └─ Tailwind v4
        │
        ▼
[Vercel] (서버 + Edge)
  ├─ Server Components (데이터 fetch)
  ├─ Server Actions (mutation)
  └─ Proxy 미들웨어 (쿠키 세션 — /admin/* 보호)
        │
        ▼
[Supabase Tokyo region]
  ├─ Postgres
  │   ├─ buildings / floors / rooms
  │   ├─ departments (parent_id self-ref, 2뎁스)
  │   ├─ users (PIN bcrypt 해시)
  │   ├─ reservations / reservation_series
  │   ├─ approvals (signature_token, status)
  │   ├─ approval_routes (steps jsonb)
  │   ├─ fixed_events
  │   └─ audit/print 관련
  ├─ Realtime publication
  └─ Service-role key (서버 전용)
```

---

## 9. 데이터 모델 (요약)

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `buildings` / `floors` / `rooms` | name, display_order, map_x/y/w/h(rooms) | 호실 좌표는 0~100% 비율 |
| `departments` | name, parent_id, dept_head_id, elder_id | 2뎁스 트리. 결재 라인은 leaf만 |
| `users` | name, phone, role, dept_id, pin_hash, active | role: applicant·dept_head·elder·manager·senior_pastor·admin |
| `approval_routes` | name, steps (jsonb), conditions | "기본"·"대규모/외부행사" 두 템플릿 |
| `reservations` | ref_no, qr_token, room_id, applicant_id, dept_id, start_at, end_at, purpose, status, route_id, current_step, force_overlap | status enum: draft·pending·approved·rejected·cancelled |
| `reservation_series` | weekday, start_date, end_date, time_blocks | 매주 반복. 자식 `reservations` 자동 생성 |
| `approvals` | reservation_id (or series_id), step_order, role, approver_id, status, signature_token, comment | step_order별 1행 |
| `fixed_events` | name, weekday, start_time, end_time, room_id, effective_from/until | 결재 없는 정규 일정 |

화면 표시용 derived status (`displayStatus`): `submitted / in_review / confirmed / rejected / cancelled / draft`

---

## 10. 보안 / 권한 매트릭스

| 동작 | 신청자 | 결재자 | 당회장 | 관리자(admin) | 마스터 0000 |
|---|---|---|---|---|---|
| 신청 작성 | ✅ | ✅ | ✅ | ✅ | — |
| 본인 신청 수정 (1단계 전) | ✅ | ✅ | ✅ | ✅ | — |
| 본인 단계 결재 | — | ✅ | ✅ | ✅ | — |
| 어떤 단계든 강제 승인 | — | — | — | ✅ | ✅ |
| 결재 취소 (모든 단계 reset) | — | — | ✅ | (사무처 권한) | — |
| `/admin/*` 접근 | — | — | — | ✅ (로그인 통과) | — |

---

## 11. 성공 지표 (KPI)

| 지표 | 측정법 | 1차 목표 |
|---|---|---|
| 종이 양식 사용률 0% | 사무처 자체 추적 | 도입 3개월 내 |
| 신청서 평균 결재 완료 시간 | DB `created_at` → `status=approved` 시각 | 24시간 이내 (기존 종이 대비 1/3) |
| 신청 시점 충돌 감지율 | 폼 충돌 모달 노출 / 실제 중복 신청 | 95%+ |
| 어르신 결재 완료 자력률 | 사용자 인터뷰 | 80%+ (월 1회 인터뷰) |
| 운영자 강제 개입 빈도 | `comment LIKE '관리자 마스터%'` | 월 5회 이하 |

---

## 12. 출시 후 로드맵

### 다음 분기
- **결재 결과 알림** — 카카오 알림톡 + SMS fallback (NCP SENS 또는 SOLAPI)
- **PIN 잠금 정책 활성화** — 5회 실패 시 10분 잠금 (컬럼은 이미 존재)
- **관리자 페이지 검색** — 결재자/관리자/호실 목록 통합 검색
- **결재선 템플릿 UI** — 현재 DB 직접 편집

### 향후
- **Audit Log 테이블** — 강제 승인·결재 취소 등 민감 작업 추적
- **벌크 작업** — 신청서 일괄 승인/삭제
- **카톡 공유 버튼** — 결재 링크 공유 단축
- **본인 신청만 보기 필터** — `/reservations` 휴대폰 기반 필터

---

## 13. 참고 문서

- 시스템 규칙: [AGENTS.md](AGENTS.md)
- DB 규칙: [supabase/AGENTS.md](supabase/AGENTS.md)
- 관리자 동작: [src/app/admin/AGENTS.md](src/app/admin/AGENTS.md)
- 어르신 친화 UX: [src/components/AGENTS.md](src/components/AGENTS.md)
