-- 결재자별 텔레그램 chat_id. 외부 webhook 받는 쪽(n8n 등)에서 다음 결재자에게
-- 직접 메시지를 보내려면 결재자별 chat_id 가 필요. 본인이 텔레그램 봇과 1회
-- 대화한 뒤 그 chat_id 를 사무처가 등록하는 방식.
--
-- nullable — 텔레그램 매핑 안 한 결재자는 알림 대상에서 자연 제외.

alter table users
  add column if not exists telegram_chat_id text;

comment on column users.telegram_chat_id is
  '결재자가 텔레그램 봇과 대화하면 발급되는 chat id. webhook 페이로드의 next_approver 필드에 포함되어 n8n 이 메시지 발송 대상으로 사용.';
