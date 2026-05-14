# n8n x Telegram templates

장소사용신청서 webhook -> n8n -> Telegram fan-out setup.

The active setup guide lives in [n8n/README.md](../n8n/README.md). This file
keeps the workflow shape and message template notes close to the app docs.

## Current payload contract

`src/lib/webhook.ts` sends this shape to every URL in `WEBHOOK_TARGETS`:

```json
{
  "event": "reservation.created",
  "delivery": "uuid",
  "occurred_at": "2026-05-14T00:00:00.000Z",
  "data": {
    "kind": "reservation",
    "id": "reservation-or-series-id",
    "ref_no": "2026-0001",
    "status": "pending",
    "start_at": "2026-05-14T10:00:00+09:00",
    "end_at": "2026-05-14T12:00:00+09:00",
    "purpose": "모임",
    "applicant": {
      "name": "홍길동",
      "phone": "010-1234-5678",
      "telegram_chat_id": null
    },
    "dept_name": "청년부",
    "room": {
      "name": "본당",
      "floor_label": "1층",
      "building_name": "본관"
    },
    "recipients": [
      {
        "chat_id": "123456789",
        "name": "청년부",
        "dept_name": "청년부"
      }
    ]
  }
}
```

Important points:

- n8n should use `data.recipients[]` directly.
- n8n does not need to query Supabase for normal notification routing.
- `X-DCB-Signature` is `sha256=<base64url hmac body>`.
- `X-DCB-Event` and `X-DCB-Delivery` mirror body metadata for logs.

## Where subscriber data lives

Subscriber state is stored in the 장소사용신청서 Supabase database, not in n8n:

```text
telegram_subscribers          chat_id, display name, active flag, watch_all
telegram_subscriber_depts     which departments each subscriber receives
telegram_subscriber_events    which event types each subscriber receives
telegram_link_tokens          short-lived Telegram /start TOKEN drafts
```

The RPC `get_telegram_recipients(event_type, dept_id)` calculates the final
recipient list. n8n only receives `data.recipients[]` and sends messages.

## Workflow A: notification fan-out

Recommended nodes:

```text
Webhook (POST /dcbookspace)
  -> Code: n8n/workflows/dcbookspace-notify-code-node.js
  -> Telegram: Send Message
```

Telegram node fields:

```text
Chat ID: ={{ $json.chat_id }}
Text: ={{ $json.text }}
Parse Mode: Markdown
```

The Code node builds one item per recipient, so the Telegram node naturally
sends one message for each `chat_id`.

## Workflow B: Telegram deep-link registration

Recommended nodes:

```text
Telegram Trigger
  -> Code: n8n/workflows/telegram-link-code-node.js
  -> IF: ignore is false
  -> HTTP Request: POST {{$env.SITE_URL}}/api/telegram/link
  -> Telegram: Send Message
```

HTTP Request fields:

```text
Method: POST
URL: ={{ $env.SITE_URL.replace(/\/$/, '') + '/api/telegram/link' }}
Header Authorization: ={{ 'Bearer ' + $env.TELEGRAM_LINK_SECRET }}
Header Content-Type: application/json
Body:
{
  "token": "={{ $json.token }}",
  "chat_id": "={{ $json.chat_id }}"
}
```

## Required env values

장소사용신청서:

```env
WEBHOOK_SECRET=
WEBHOOK_TARGETS=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
TELEGRAM_LINK_SECRET=
```

n8n:

```env
WEBHOOK_SECRET=
TELEGRAM_LINK_SECRET=
SITE_URL=
OFFICE_CHAT_ID=
```

Use the same `WEBHOOK_SECRET` and `TELEGRAM_LINK_SECRET` values on both sides.

## Smoke test

```bash
node n8n/smoke-test.mjs https://n8n.example.com/webhook/dcbookspace "$WEBHOOK_SECRET" 123456789
```

For local development, use the n8n test webhook URL while the workflow is
listening:

```bash
node n8n/smoke-test.mjs http://localhost:5678/webhook-test/dcbookspace "$WEBHOOK_SECRET"
```
