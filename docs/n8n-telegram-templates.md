# n8n × 텔레그램 알림 템플릿

DCbookspace webhook 을 n8n 에서 받아 텔레그램으로 fan-out 할 때 쓰는 메시지 4종.

## 0. 워크플로 전체 모양

```
[Webhook 노드]                          # POST /webhook/dcbookspace
   ↓
[Function: HMAC 검증]                    # X-DCB-Signature 검사
   ↓
[Switch: $json.event 값으로 분기]
   ├── reservation.created       → [Function 1] → [Telegram 발송]
   ├── reservation.step_approved → [Function 2] → [Telegram 발송]
   ├── reservation.approved      → [Function 3] → [Telegram 발송]
   └── reservation.rejected      → [Function 4] → [Telegram 발송]
```

각 Function 노드는 메시지 텍스트 + 발송 대상 chat_id 들의 배열을 만들어 다음
Telegram 노드(loop) 가 한 번에 fan-out.

---

## HMAC 검증 (Function)

```js
const crypto = require('crypto');

const sig = ($request.headers['x-dcb-signature'] || '').replace('sha256=', '');
const raw = JSON.stringify($input.first().json); // n8n 의 raw body 옵션 켜둘 것
const expected = crypto
  .createHmac('sha256', $env.WEBHOOK_SECRET)
  .update(raw)
  .digest('base64url');

if (
  sig.length !== expected.length ||
  !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
) {
  throw new Error('signature mismatch');
}
return $input.all();
```

> n8n 에서 raw body 가 깔끔히 잡히는지는 워크플로 첫 실행 시 확인 필요. 문제
> 있으면 임시로 검증 skip 후 동작 확인 → 나중에 다시 켜기.

---

## Function 1 — `reservation.created`

신청서가 막 들어왔을 때. **1단계 결재자** + **신청자 본인** 에게.

```js
const data = $json.data;
const refNo = data.ref_no || data.id.slice(0, 8);
const room = `${data.room.building_name} ${data.room.floor_label} ${data.room.name}`;
const date = data.start_at?.slice(0, 10) ?? '';
const usage = `${data.start_at?.slice(11, 16) ?? ''}–${data.end_at?.slice(11, 16) ?? ''}`;

const text =
  `📋 *새 신청서 접수* #${refNo}\n` +
  `\n` +
  `👤 신청자: ${data.applicant.name}\n` +
  `🏷 부서: ${data.dept_name || '-'}\n` +
  `🏛 장소: ${room}\n` +
  `📅 ${date} ${usage}\n` +
  `💬 ${data.purpose}\n` +
  `\n` +
  `결재 부탁드립니다.`;

// 1단계 결재자 후보 중 chat_id 등록된 사람만
const targets = (data.next_approvers || [])
  .filter(a => a.telegram_chat_id)
  .map(a => a.telegram_chat_id);

return targets.map(chat_id => ({
  json: { chat_id, text, parse_mode: 'Markdown' },
}));
```

---

## Function 2 — `reservation.step_approved`

한 단계 통과. **다음 단계 결재자** 에게.

```js
const data = $json.data;
const refNo = data.ref_no || data.id.slice(0, 8);
const room = `${data.room.building_name} ${data.room.floor_label} ${data.room.name}`;
const date = data.start_at?.slice(0, 10) ?? '';
const usage = `${data.start_at?.slice(11, 16) ?? ''}–${data.end_at?.slice(11, 16) ?? ''}`;

const completedRole = data.step_label || data.step_role || '단계';
const totalSteps = data.total_steps || '?';
const stepOrder = data.step_order || '?';

const text =
  `✅ *결재 진행* #${refNo}\n` +
  `\n` +
  `${completedRole} 결재 완료 (${stepOrder}/${totalSteps})\n` +
  `\n` +
  `👤 ${data.applicant.name} · ${data.dept_name || '-'}\n` +
  `🏛 ${room}\n` +
  `📅 ${date} ${usage}\n` +
  `\n` +
  `다음 단계 결재 부탁드립니다.`;

const targets = (data.next_approvers || [])
  .filter(a => a.telegram_chat_id)
  .map(a => a.telegram_chat_id);

// 마지막 단계 통과면 next_approvers 가 비어 → fan-out 안 됨 (정상)
return targets.map(chat_id => ({
  json: { chat_id, text, parse_mode: 'Markdown' },
}));
```

---

## Function 3 — `reservation.approved`

모든 결재 통과 → 신청 확정. **신청자 본인** 에게.

```js
const data = $json.data;
const refNo = data.ref_no || data.id.slice(0, 8);
const room = `${data.room.building_name} ${data.room.floor_label} ${data.room.name}`;
const date = data.start_at?.slice(0, 10) ?? '';
const usage = `${data.start_at?.slice(11, 16) ?? ''}–${data.end_at?.slice(11, 16) ?? ''}`;

const text =
  `🎉 *예약 확정* #${refNo}\n` +
  `\n` +
  `모든 결재가 완료되었습니다.\n` +
  `\n` +
  `🏛 ${room}\n` +
  `📅 ${date} ${usage}\n` +
  `💬 ${data.purpose}` +
  (data.admin_forced ? `\n\n⚙ 관리자 강제 예약` : '');

// 신청자 본인 chat_id — applicant.telegram_chat_id 가 페이로드에 없으니
// applicant.phone 로 매핑 테이블에서 조회 필요. 아래 두 가지 방법:
//
// (가) DCbookspace users 테이블 join 필요 → 별도 HTTP Request 노드 추가:
//      GET https://dcbookspace.vercel.app/api/v1/...
//      (현재 신청자 phone → telegram_chat_id 조회 endpoint 없음 — 추후 추가)
//
// (나) n8n 자체에 phone → chat_id 룩업 테이블(Set node 또는 외부 sheet)
//      유지하면서 일치하는 사람에게 전송
//
// 간단 시작: 결재자 전원에게도 같이 알림 (공지 차원)
const allChatIds = [
  // TODO: applicant chat_id 매핑 채우기
  // ...n8n 에 저장한 phone → chat_id 룩업
];

return allChatIds.map(chat_id => ({
  json: { chat_id, text, parse_mode: 'Markdown' },
}));
```

> 📝 신청자 알림은 페이로드에 그대로 phone 만 들어오므로 n8n 쪽에서 phone →
> chat_id 매핑이 필요합니다. 임시: 결재자 전원에게 공지로 보내거나, 그냥
> 사무실 단톡방 chat_id 한 곳으로만 보내는 식.

---

## Function 4 — `reservation.rejected`

반려. **신청자 본인** + **사무실 단톡방** 에.

```js
const data = $json.data;
const refNo = data.ref_no || data.id.slice(0, 8);
const room = `${data.room.building_name} ${data.room.floor_label} ${data.room.name}`;
const date = data.start_at?.slice(0, 10) ?? '';
const usage = `${data.start_at?.slice(11, 16) ?? ''}–${data.end_at?.slice(11, 16) ?? ''}`;

const text =
  `❌ *신청 반려* #${refNo}\n` +
  `\n` +
  `👤 ${data.applicant.name} · ${data.dept_name || '-'}\n` +
  `🏛 ${room}\n` +
  `📅 ${date} ${usage}\n` +
  `💬 ${data.purpose}` +
  (data.admin_forced ? `\n\n⚙ 관리자 강제 반려` : '');

// 보낼 곳: 사무실 단톡방 chat_id (n8n 환경변수 OFFICE_CHAT_ID 권장)
const officeChatId = $env.OFFICE_CHAT_ID;

return [{ json: { chat_id: officeChatId, text, parse_mode: 'Markdown' } }];
```

---

## Telegram 노드 (공통)

각 Function 노드 뒤에 같은 모양:

- **Resource**: Message
- **Operation**: Send Message
- **Chat ID**: `={{ $json.chat_id }}`
- **Text**: `={{ $json.text }}`
- **Additional Fields → Parse Mode**: `Markdown`

n8n 의 Telegram 노드는 입력 아이템 N개면 자동으로 N번 호출 (loop 안 만들어도 됨).

---

## 환경변수 (n8n)

| Key | 설명 |
|---|---|
| `WEBHOOK_SECRET` | DCbookspace `WEBHOOK_SECRET` 과 동일 값 |
| `TELEGRAM_BOT_TOKEN` | BotFather 가 발급한 토큰 (n8n Telegram Credential 안에 저장 권장) |
| `OFFICE_CHAT_ID` | 사무실 단톡방 chat_id (반려·실패 등 운영 알림 받을 곳) |

---

## 동작 검증

1. webhook.site 로 페이로드 모양 먼저 확인
2. n8n 워크플로에 Webhook URL 등록 → DCbookspace `WEBHOOK_TARGETS` 갱신 → redeploy
3. 신청 1건 만들기 → 1단계 결재자 텔레그램에 메시지 떠야 정상
4. 1단계 결재 완료 → 2단계 결재자에게 메시지
5. ...
6. 모두 통과 → 신청자(또는 사무실)에게 확정 메시지

---

## 추후 개선

- [ ] 신청자 phone → telegram_chat_id 매핑 endpoint (DCbookspace 측 신규 추가)
- [ ] inline 버튼 (메시지에 [확인하기] 버튼 → 결재 페이지 직링크)
- [ ] 그룹 단톡방에 결재 진행도 한 줄 요약 (스레드)
- [ ] 인쇄 실패(`reservation.print_failed`) 알림 — 본 문서엔 미포함 (관리자만 받게)
