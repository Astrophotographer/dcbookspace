// n8n Code node: extract /start TOKEN from a Telegram Trigger update.
//
// Expected workflow:
//   Telegram Trigger
//     -> Code node with this script
//     -> HTTP Request POST {{$env.SITE_URL}}/api/telegram/link
//     -> Telegram Send Message
//
// HTTP Request node:
//   Method: POST
//   URL: ={{ $env.SITE_URL.replace(/\/$/, '') + '/api/telegram/link' }}
//   Headers:
//     Authorization: ={{ 'Bearer ' + $env.TELEGRAM_LINK_SECRET }}
//     Content-Type: application/json
//   Body JSON:
//     { "token": "={{ $json.token }}", "chat_id": "={{ $json.chat_id }}" }

const update = $input.first().json;

// Telegram update 종류별 message 위치를 하나로 맞춘다.
const message =
  update.message ??
  update.edited_message ??
  update.channel_post ??
  update.callback_query?.message ??
  {};

const text = String(message.text ?? "");
const chatId = message.chat?.id;

// /start TOKEN 형식에서 TOKEN만 추출.
const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/);

// deep-link가 아니면 안내 메시지만 보낸다.
if (!match?.[1] || chatId == null) {
  return [
    {
      json: {
        ignore: true,
        chat_id: chatId == null ? "" : String(chatId),
        text:
          "장소사용신청서 알림 연결 링크에서 Start 버튼을 눌러 주세요.",
      },
    },
  ];
}

// 다음 HTTP Request 노드가 이 값으로 등록 API를 호출한다.
return [
  {
    json: {
      ignore: false,
      token: match[1],
      chat_id: String(chatId),
    },
  },
];
