# Telegram direct notifications

장소사용신청서는 n8n 없이도 Telegram 알림을 직접 보낼 수 있다.

## Required values

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET_TOKEN=
```

- `TELEGRAM_BOT_TOKEN`: BotFather token. Server-only secret.
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`: random value used by Telegram webhook
  verification. Use the same value when calling `setWebhook`.

Optional fallback:

```env
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
```

If this is blank, DCbookspace calls Telegram Bot API `getMe` with
`TELEGRAM_BOT_TOKEN` and uses the returned bot username for the `/me/telegram`
deep link.

## One-time webhook setup

Register the staging app URL as the bot webhook:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://dcbookspace.vercel.app/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET_TOKEN"
```

For production, use a separate production bot and URL:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://dcbook.vercel.app/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET_TOKEN"
```

Telegram allows one webhook URL per bot. Use a separate bot for production and
staging if both environments must receive `/start TOKEN` registrations at the
same time.

## Recipient setup

1. Run the Telegram subscriber migration.
2. Open `/me/telegram`.
3. Enter name, phone, department, and notification scope.
4. Press automatic connection and start the bot.

봇이 `/start TOKEN`을 `/api/telegram/webhook`으로 보내면,
장소사용신청서가 결과 `chat_id`를 `telegram_subscribers`에 저장한다.

## Runtime behavior

- Application and approval server actions call `src/lib/webhook.ts`.
- If `TELEGRAM_BOT_TOKEN` is set, notifications are sent directly with
  Telegram `sendMessage`.
- If `WEBHOOK_TARGETS` is also set, the existing external webhook/n8n flow still
  receives the same events.
- Telegram failures are logged only. Reservation and approval actions continue.
