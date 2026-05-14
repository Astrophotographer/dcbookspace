// n8n Code node: 장소사용신청서 webhook -> Telegram items.
//
// Expected input:
//   Webhook node receives POST from 장소사용신청서.
//
// Expected output:
//   One n8n item per Telegram recipient.
//
// Telegram node:
//   Chat ID: ={{ $json.chat_id }}
//   Text: ={{ $json.text }}
//   Parse Mode: Markdown

const root = $input.first().json;

// Webhook 노드가 body/header를 감싸서 주는 경우까지 정리.
const headers = root.headers ?? {};
const payload = root.body ?? root;
const data = payload.data ?? root.data ?? {};

// 이벤트명은 header 우선, 없으면 body에서 가져온다.
const event =
  headers["x-dcb-event"] ??
  payload.event ??
  root.event;

// 이 목록에 없는 이벤트는 조용히 무시.
const ALLOWED = [
  "reservation.created",
  "series.created",
  "reservation.approved",
  "reservation.rejected",
  "reservation.cancelled",
  "reservation.step_approved",
  "reservation.print_failed",
  "test.message",
];

if (!ALLOWED.includes(event)) return [];

// 발송 대상은 n8n에 하드코딩하지 않는다.
// 장소사용신청서가 Supabase의 telegram_subscribers / telegram_subscriber_depts /
// telegram_subscriber_events 기준으로 계산해서 data.recipients에 담아 보낸다.
const recipients = Array.isArray(data.recipients)
  ? data.recipients.filter((r) => r?.chat_id)
  : [];

if (recipients.length === 0) return [];

const approverName = data.approver_name ?? "";
const stepLabel = data.step_label ?? data.step_role ?? "";
const deptName = data.dept_name ?? "-";
const applicantName = data.applicant?.name ?? "-";
const phone = data.applicant?.phone ?? "";

// 메시지에 반복해서 쓰는 표시값.
const refNo = data.ref_no || String(data.id ?? "").slice(0, 8);
const room = data.room
  ? `${data.room.building_name ?? ""} ${data.room.floor_label ?? ""} ${data.room.name ?? ""}`.trim()
  : "";

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const kstTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatKstDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "").slice(0, 10);
  return kstDateFormatter.format(date);
}

function formatKstTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "").slice(11, 16);
  return kstTimeFormatter.format(date);
}

function formatWhen(data) {
  if (data.start_at && data.end_at) {
    const startDate = formatKstDate(data.start_at);
    const endDate = formatKstDate(data.end_at);
    const startTime = formatKstTime(data.start_at);
    const endTime = formatKstTime(data.end_at);
    return startDate === endDate
      ? `${startDate} ${startTime}-${endTime}`
      : `${startDate} ${startTime} ~ ${endDate} ${endTime}`;
  }
  if (data.start_date && data.end_date) {
    return data.start_date === data.end_date
      ? String(data.start_date)
      : `${data.start_date} ~ ${data.end_date}`;
  }
  return String(data.start_date ?? "");
}

const when = formatWhen(data);

const purpose = data.purpose ?? "";

let text = "";

// 이벤트별 Telegram 문구.
if (event === "reservation.created" || event === "series.created") {
  text =
    `📋 *${deptName} ${applicantName}의 신청서가 접수되었습니다* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}\n` +
    `\n결재 결과가 나오면 다시 알려드릴게요.`;
} else if (event === "reservation.rejected") {
  text =
    `❌ *${deptName} ${applicantName} 신청이 반려되었습니다* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}` +
    (data.admin_forced ? `\n\n관리자 강제 반려` : "");
} else if (event === "reservation.approved") {
  text =
    `🎉 *${deptName} ${applicantName} 예약이 확정되었습니다* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}` +
    (data.admin_forced ? `\n\n관리자 강제 예약` : "");
} else if (event === "reservation.cancelled") {
  text =
    `❌ *${deptName} ${applicantName} 예약이 취소되었습니다* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}`;
} else if (event === "reservation.print_failed") {
  text =
    `❌ *${deptName} ${applicantName} 프린트가 나오지 않았습니다* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}`;
} else if (event === "reservation.step_approved") {
  text =
    `📋 *${deptName} ${applicantName}의 결재라인 중 ${stepLabel} ${approverName}의 결재승인이 일어남* #${refNo}\n` +
    `\n🏛 ${room}\n📅 ${when}\n💬 ${purpose}`;
} else if (event === "test.message") {
  text =
    `*장소사용신청서 알림 연결 확인*\n` +
    `\n${deptName} 알림이 연결되었습니다.`;
}

// Telegram 노드가 입력 item 하나당 한 번씩 발송한다.
return recipients.map((recipient) => ({
  json: {
    chat_id: String(recipient.chat_id),
    text,
    parse_mode: "Markdown",
    recipient_name: recipient.name ?? "",
    recipient_dept_name: recipient.dept_name ?? "",
    event,
    applicant_phone: phone,
  },
}));
