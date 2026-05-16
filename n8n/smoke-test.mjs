#!/usr/bin/env node
import { createHmac, randomUUID } from "node:crypto";

const [url, secret = "", chatId = ""] = process.argv.slice(2);

if (!url) {
  console.error(
    [
      "Usage:",
      "  node n8n/smoke-test.mjs <n8n-webhook-url> [webhook-secret] [telegram-chat-id]",
      "",
      "Examples:",
      "  node n8n/smoke-test.mjs http://localhost:5678/webhook-test/dcbookspace",
      "  node n8n/smoke-test.mjs https://n8n.example.com/webhook/dcbookspace $WEBHOOK_SECRET 123456789",
    ].join("\n"),
  );
  process.exit(1);
}

const body = JSON.stringify({
  event: "test.message",
  delivery: randomUUID(),
  occurred_at: new Date().toISOString(),
  data: {
    kind: "test",
    recipients: chatId
      ? [{ chat_id: chatId, name: "n8n smoke test", dept_name: null }]
      : [],
  },
});

const headers = {
  "content-type": "application/json; charset=utf-8",
  "x-dcb-event": "test.message",
  "x-dcb-delivery": randomUUID(),
};

if (secret) {
  headers["x-dcb-signature"] = `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("base64url")}`;
}

const res = await fetch(url, {
  method: "POST",
  headers,
  body,
});

const text = await res.text();
console.log(`${res.status} ${res.statusText}`);
if (text) console.log(text);
