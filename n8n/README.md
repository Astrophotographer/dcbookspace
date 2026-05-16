# 장소사용신청서 n8n setup

장소사용신청서 webhook 이벤트는 `src/lib/webhook.ts`에서 발송된다.
이 폴더는 n8n 쪽 설정을 담는다: self-host compose 파일, env 템플릿,
Code 노드 스니펫, smoke test sender.

## What gets connected

```text
장소사용신청서
  -> WEBHOOK_TARGETS
  -> n8n Webhook /webhook/dcbookspace
  -> n8n Code node builds recipient messages
  -> Telegram node sends fan-out messages

Telegram /start TOKEN
  -> n8n Telegram Trigger
  -> POST SITE_URL/api/telegram/link
  -> 장소사용신청서가 telegram_subscribers row 저장
```

장소사용신청서는 바로 사용할 수 있는 `data.recipients[]` 배열을 보낸다.
n8n은 일반 알림 라우팅을 위해 Supabase를 직접 조회하지 않는다.

구독자 데이터는 장소사용신청서 Supabase 데이터베이스에 저장한다:

- `telegram_subscribers`: `chat_id`, display name, active flag, `watch_all`
- `telegram_subscriber_depts`: department subscriptions
- `telegram_subscriber_events`: event subscriptions
- `telegram_link_tokens`: short-lived Telegram `/start TOKEN` drafts

The app calls `get_telegram_recipients(event_type, dept_id)` before sending the
webhook, so n8n does not need Supabase URL or service-role credentials.

## 1. Run n8n locally or on a server

For self-hosting:

```bash
cd n8n
cp .env.example .env
# Fill POSTGRES_PASSWORD, N8N_ENCRYPTION_KEY, WEBHOOK_SECRET,
# TELEGRAM_LINK_SECRET, SITE_URL, and public URL fields.
docker compose up -d
```

Open `http://localhost:5678`.

For production, put n8n behind a real HTTPS URL such as `https://n8n.example.com`
and set these in `n8n/.env`:

```env
N8N_HOST=n8n.example.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.example.com/
N8N_EDITOR_BASE_URL=https://n8n.example.com/
N8N_SECURE_COOKIE=true
SITE_URL=https://dcbookspace.vercel.app
```

Official references checked while creating this setup:
[n8n Docker install](https://docs.n8n.io/hosting/installation/docker/),
[n8n deployment env vars](https://docs.n8n.io/hosting/configuration/environment-variables/deployment/),
[Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/),
[Code node](https://docs.n8n.io/code/code-node/).

## 2. Add App Env Values

Use the same random values on both sides.

장소사용신청서 `.env.local` 또는 Vercel env:

```env
WEBHOOK_SECRET=replace-with-openssl-rand-hex-32
WEBHOOK_TARGETS=https://n8n.example.com/webhook/dcbookspace
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsername
TELEGRAM_LINK_SECRET=replace-with-openssl-rand-hex-32
```

In `n8n/.env`:

```env
WEBHOOK_SECRET=same-as-dcbookspace
TELEGRAM_LINK_SECRET=same-as-dcbookspace
SITE_URL=https://dcbookspace.vercel.app
```

For local testing, use the n8n test webhook URL:

```env
WEBHOOK_TARGETS=http://localhost:5678/webhook-test/dcbookspace
```

## 3. Workflow A: 장소사용신청서 -> Telegram

Create a new n8n workflow:

1. Add **Webhook** node.
2. Set **HTTP Method** to `POST`.
3. Set **Path** to `dcbookspace`.
4. Set **Respond** to `Immediately`.
5. Add option **Raw Body** if your n8n version exposes it.
6. Add **Code** node and paste
   `n8n/workflows/dcbookspace-notify-code-node.js`.
   This script converts reservation `start_at` / `end_at` to `Asia/Seoul`
   before composing the Telegram message.
7. Add **Telegram** node:
   - Resource: `Message`
   - Operation: `Send Message`
   - Chat ID: `={{ $json.chat_id }}`
   - Text: `={{ $json.text }}`
   - Parse Mode: `Markdown`
8. Create or select the Telegram credential using the BotFather token.
9. Activate the workflow and copy the production webhook URL into
   `WEBHOOK_TARGETS`.

The Code node verifies `X-DCB-Signature` when both `WEBHOOK_SECRET` and the
signature header are present. If signature verification fails during first
setup, compare the Webhook node's raw-body shape in the execution log before
disabling verification.

## 4. Workflow B: Telegram auto-link

Create a second workflow:

1. Add **Telegram Trigger** node with the same bot credential.
2. Add **Code** node and paste `n8n/workflows/telegram-link-code-node.js`.
3. Add **IF** node and continue only when `={{ $json.ignore }}` is `false`.
4. Add **HTTP Request** node:
   - Method: `POST`
   - URL: `={{ $env.SITE_URL.replace(/\/$/, '') + '/api/telegram/link' }}`
   - Headers:
     - `Authorization`: `={{ 'Bearer ' + $env.TELEGRAM_LINK_SECRET }}`
     - `Content-Type`: `application/json`
   - Body Content Type: `JSON`
   - Body:
     ```json
     {
       "token": "={{ $json.token }}",
       "chat_id": "={{ $json.chat_id }}"
     }
     ```
5. Add **Telegram Send Message** node:
   - Chat ID: `={{ $('Code').item.json.chat_id }}`
   - Text:
     `={{ $json.ok ? '알림 연결 완료: ' + $json.scope_label : '연결 실패: ' + $json.error }}`
6. Activate the workflow.

Now `/me/telegram` can create a Telegram deep link. When the user presses Start,
n8n은 `chat_id`를 장소사용신청서로 다시 등록한다.

## 5. Smoke test

With the n8n workflow listening:

```bash
node n8n/smoke-test.mjs http://localhost:5678/webhook-test/dcbookspace "$WEBHOOK_SECRET"
```

To send a real Telegram message, pass a chat id as the third argument:

```bash
node n8n/smoke-test.mjs https://n8n.example.com/webhook/dcbookspace "$WEBHOOK_SECRET" 123456789
```

## 6. Production checklist

- n8n URL is public HTTPS.
- `WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` match the public n8n URL.
- `N8N_ENCRYPTION_KEY` is fixed before real credentials are created.
- production env uses the production n8n webhook URL.
- Staging/local env uses staging/local n8n URLs only.
- The Telegram credential uses the intended bot token.
- Workflow A and B are active.
- `WEBHOOK_SECRET` and `TELEGRAM_LINK_SECRET` match exactly across both systems.

Do not point local work at the production Supabase project.
