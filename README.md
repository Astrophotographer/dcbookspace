# DCbookspace

교회 장소 사용 신청·결재 시스템.
종이 신청서를 디지털화하면서도 결재자(장로·차장·당회장)가 익숙한 종이 양식 형태와 단순한 PIN 입력 흐름은 그대로 유지하는 데 초점을 맞춘 프로젝트입니다.

**Live**: [dcbookspace.vercel.app](https://dcbookspace.vercel.app)

---

## 주요 기능

### 신청자
- 장소 / 일시 / 사용목적 / 사용인원 입력 (다일 예약 지원)
- 휴대폰 8자리만 입력하면 `010-1234-5678` 자동 정렬
- 날짜 8자리만 입력하면 자동 dash + 월/일 범위 자동 보정 (윤년 반영)
- 신청 직후 새 탭에 **A4 결재 서류 + QR 코드** 자동 인쇄

### 결재 흐름
- **단일 QR + PIN 4자리** 로 단계 자동 라우팅
  - QR 1개를 차장 / 관리장로 / 당회장이 모두 사용
  - PIN으로 사용자 식별 → 자기 단계면 진행, 아니면 안내 메시지
- **마스터 키 `0000`**: 어떤 단계든 강제 승인 (운영자 비상용)
- **결재 취소는 당회장 전용**: 모든 단계 끝난 신청에 한해, 2단계 모달(확인 → PIN)로 취소
- 결재자 등록 시 **휴대폰 뒷 4자리가 자동 PIN**으로 등록 (어르신 친화)

### 노년층 친화 UX
- 루트 폰트 17px, 큰 입력칸
- PIN 입력칸 활성/비활성 상태에 **색 + 아이콘 + 텍스트 + 그림자** 다중 신호 (색맹 대응)
- PIN 오답 시 0.45초 흔들림 + 빨간 강조 + 즉시 비움

### 메인 화면
- 월간 캘린더 (다일 예약은 모든 해당 날짜에 칩 표시)
- 셀 클릭 → 그날 예약 리스트가 캘린더 아래 펼쳐짐
- 호실 도면 뷰: 색상으로 점유 상태(비어있음 / 결재 진행중 / 예약완료 / 혼합) 한눈에

### 관리자
- BasicAuth 미들웨어로 `/admin` 보호
- 신청서 리스트(테이블, 최신순) → 상세에서 QR · 진행 상황 · 재출력 · 강제예약 / 삭제
- 호실 관리: 건물·층 사이드바 + 캔버스에서 박스 **드래그앤드롭으로 위치/크기** 조정
- 사용자 관리: 결재자 추가 시 자동 PIN 발급
- Supabase **Realtime**으로 다른 탭/기기의 변경이 즉시 반영

---

## 기술 스택

- **Next.js 16** (App Router, Turbopack, Server Actions)
- **TypeScript**, **Tailwind CSS v4**
- **Supabase** (Postgres, Auth-less PIN 모델, Realtime)
- **bcrypt** (PIN 해시)
- **date-fns**, **qrcode**, **lucide-react**

배포는 **Vercel**.

---

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수

`.env.example` 을 `.env.local` 로 복사해 채웁니다.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_APP_URL=http://localhost:3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=강한_비밀번호
```

`SUPABASE_SERVICE_ROLE_KEY` 는 서버에서만 사용되며 브라우저에 노출되지 않습니다.
`ADMIN_PASSWORD` 가 비어 있으면 `/admin` 접근 시 503으로 막혀 실수로 보호 풀린 채 배포되는 것을 방지합니다.

### 3. 데이터베이스 마이그레이션

`supabase/migrations/` 의 SQL을 순서대로 실행합니다.

| 파일 | 내용 |
|---|---|
| `0001_initial_schema.sql` | 테이블 / RPC / 트리거 (충돌 검증, 신청번호 자동 생성) |
| `0002_seed.sql` | 건물·호실·부서 예시 데이터 |
| `0003_enable_realtime.sql` | rooms / reservations / approvals를 Realtime publication에 추가 |
| `0004_update_approval_routes.sql` | 결재선 라벨 (차장 → 관리장로 → 당회장) |
| `0005_reservation_qr_token.sql` | 신청서당 단일 QR 토큰 |

Supabase CLI:

```bash
supabase db push
```

또는 Supabase Studio의 SQL Editor에서 차례로 실행해도 됩니다.

### 4. 개발 서버

```bash
npm run dev
```

`http://localhost:3000` 에서 확인.

같은 와이파이의 휴대폰에서 QR을 스캔해 결재 흐름을 테스트하려면 PC IP 주소(`http://192.168.X.X:3000`) 로 접속해 신청서를 출력하세요. 코드의 `resolveBaseUrl` 이 요청 호스트를 자동으로 사용해 QR을 동적으로 갱신합니다.

---

## 데이터 모델 메모

- `reservations.qr_token` — 신청서당 단일 QR (단계별 토큰 대신)
- `reservations.status` 가 `pending` 인 동안 화면에는 진행 정도에 따라 **결재대기중 / 결재진행중** 으로 표시 (DB enum과 별도의 derived status)
- `approvals.status='skipped'` — 관리자가 강제 예약했을 때 미처리 단계를 표시
- `users.pin_hash` — bcrypt 해시. 결재자 등록 시 휴대폰 뒷 4자리로 자동 발급
- 호실 좌표 `map_x/y/w/h` — 0~100% 비율, 화면 크기 무관

---

## 보안 노트

- `/admin/*` 모든 경로 (server actions의 POST 포함) 가 BasicAuth로 보호
- PIN 4자리는 보안상 약한 편이지만 어르신 사용성을 우선해서 채택. 휴대폰 뒷 4자리를 초기 PIN으로 쓰는 점도 동일한 트레이드오프
- 마스터 키 `0000` 은 운영자만 알도록 유지
- 시크릿 키는 모두 `.env.local` 에 두고 `.gitignore` 처리. 코드에 하드코딩 없음

---

## 배포

Vercel 권장.

```bash
vercel --prod
```

배포 후 Vercel 환경 변수에 위 5개를 등록하고 재배포합니다.

---

## 라이선스

Private use. 교회 내부 운영용 프로젝트입니다.
