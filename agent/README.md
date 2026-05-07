# DCbookspace 인쇄 에이전트

Vercel 에 배포된 DCbookspace 사이트의 신청서 인쇄 요청을 폴링해서, 사무실 네트워크 프린터(Sindoh D450 등)로 자동 전송하는 작은 Node 에이전트.

```
[사용자]
   ↓ 신청
[Vercel: Next 앱] ← print_status='requested' INSERT
   ↑
   │ /api/print/jobs (5초마다 폴링)
   │ /api/print/status (결과 보고)
   ↓
[NAS 의 이 컨테이너]
   ↓ Raw 9100 (TCP)
[프린터]
```

## 1. 사전 준비

### Vercel 측
1. **`PRINT_AGENT_TOKEN`** 환경변수 추가 (Project Settings → Environment Variables → Production)
   - 값: 길고 무작위한 비밀 문자열 (예: `openssl rand -hex 32` 결과)
2. 재배포 (Vercel 자동 트리거)

### 프린터 측
1. **LAN 케이블 연결** 또는 WiFi 설정
2. 라우터 관리 화면에서 **DHCP 예약**으로 IP 고정 (예: `192.168.0.50`)
3. 프린터 메뉴에서 Raw 9100 활성화 확인 (보통 기본 ON)

### NAS 측 — Synology Container Manager 설치
1. DSM 패키지 센터 → **Container Manager** 검색·설치 (DSM 7.2+ / Plus 시리즈만)
   - 모델이 j 시리즈/구형이면 도커 미지원. 라즈베리파이 등 대체 필요.

---

## 2. 설치 (Synology DSM 7.x 기준)

### A. SSH 가 익숙하면

```bash
# 1) NAS 의 임의 디렉토리에 agent/ 폴더 통째로 복사
#    (예: /volume1/docker/dcbookspace-print)
cd /volume1/docker/dcbookspace-print

# 2) .env 만들기
cp .env.example .env
vi .env   # APP_BASE_URL · PRINT_AGENT_TOKEN · PRINTER_HOST 채움

# 3) 빌드 & 시작
sudo docker compose up -d --build

# 4) 로그 확인
sudo docker compose logs -f
```

### B. GUI 만으로

1. **File Station** 으로 NAS 의 `/docker/dcbookspace-print/` (없으면 생성) 에 `agent/` 폴더 통째 업로드.
2. `agent/.env.example` 을 같은 위치에 `.env` 라는 이름으로 복사 후 **텍스트 편집** 으로 값 채움.
3. **Container Manager** → **프로젝트** 탭 → **생성** 클릭.
   - 프로젝트 이름: `dcbookspace-print`
   - 경로: 위에서 만든 디렉토리 선택
   - 소스: "기존 docker-compose.yml 사용"
4. **다음** → **완료** 후 자동으로 빌드·시작.
5. 컨테이너 탭에서 `dcbookspace-print-agent` 의 **로그** 보면서 정상 동작 확인.

---

## 3. 동작 검증

1. 웹사이트 `/apply` 에서 신청서 1건 작성·제출
2. `/reservations/{id}?just=1` 진입 → "프린트 진행 상황" 카드:
   - 처음: **요청** active
   - 5초 안에 → **진행중** (에이전트가 잡았다는 뜻)
   - 잠시 후 → **완료** (인쇄 끝)
3. 사무실 프린터에서 신청서 출력물 나옴 ✅

문제 시:
- 30초 안에 진행중으로 안 넘어가면 → **실패** 자동 마킹 + 빨간 박스
- NAS 의 `docker compose logs` 에서 어떤 에러인지 확인:
  - `jobs fetch failed: 401` → 토큰 안 맞음
  - `printer connection timeout` → 프린터 IP/포트 문제, 같은 LAN 인지 확인
  - `protocol error: HTTP 503` → Vercel 측 PRINT_AGENT_TOKEN 환경변수 미설정

---

## 4. 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `APP_BASE_URL` | ✅ | Vercel 사이트 URL (예: `https://dcbookspace.vercel.app`) |
| `PRINT_AGENT_TOKEN` | ✅ | Vercel 과 동일한 비밀 토큰 |
| `PRINTER_HOST` | ✅ | 프린터 LAN IP |
| `PRINTER_PORT` | | Raw 9100 포트 (기본 9100) |
| `POLL_INTERVAL_SEC` | | 폴링 주기 초 (기본 5) |

---

## 5. 자주 묻는 것

**Q. 컨테이너 메모리는?**
A. Puppeteer + Chromium 떠 있으니 약 200~400MB. + 시리즈 NAS 면 여유.

**Q. 호스트 네트워크 모드 안 되는 모델인데?**
A. `docker-compose.yml` 의 `network_mode: bridge` 그대로 두면 됩니다. 프린터·Vercel 모두 LAN/WAN 으로 접근 가능.

**Q. 프린터가 PCL 만 받는 모델이면?**
A. 현재 에이전트는 PDF 를 9100 에 그대로 던집니다. Sindoh D450 은 PDF Direct Print 지원 OK. 다른 모델 중 PCL/PostScript 만 받는 경우엔 `printer.ts` 에서 PDF → PostScript 변환 (`ghostscript`) 단계가 추가로 필요. 별도 요청 주세요.

**Q. NAS 가 다운되면?**
A. 컨테이너 `restart: unless-stopped` 라 NAS 부팅과 함께 자동 재시작. 그 사이 신청서들은 `requested` 상태로 쌓여 있다가 에이전트가 다시 떠 한 번에 처리.

**Q. 같은 신청서를 두 번 인쇄하지 않게?**
A. 에이전트가 잡자마자 status='printing' 으로 마킹 → 다음 폴링에서 그 행은 후보에서 빠짐. + 메모리 in-flight set 으로 같은 cycle 안에서도 중복 방지.
