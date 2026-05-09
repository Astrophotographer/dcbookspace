/**
 * DCbookspace 푸시 알림 Service Worker
 *
 * 트리거:
 *   1) push 이벤트 → 시스템 알림 표시
 *   2) notificationclick → 해당 신청서 상세 페이지로 이동 (이미 열린 탭 있으면 focus)
 *
 * 페이로드 형식 (서버 lib/push.ts 가 보내는 JSON):
 *   { title, body, url?, tag? }
 *
 * 캐시·offline 동작은 안 함 — 알림 전용 minimal worker.
 */

self.addEventListener("install", () => {
  // 새 SW 즉시 활성화 — 사용자가 페이지 새로고침 안 해도 다음 push 부터 적용
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // payload 가 JSON 이 아니면 일반 텍스트로 처리
    data = { title: "등촌교회", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "등촌교회 장소사용신청";
  const options = {
    body: data.body || "",
    icon: "/icon",
    badge: "/icon",
    // 같은 tag 의 알림은 한 묶음으로 (예: 같은 신청서 여러 단계 알림 누적 방지)
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    // 화면 꺼져있어도 즉시 알림 (배터리 영향 작음, 결재성 알림이라 OK)
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 같은 URL 의 탭이 이미 열려 있으면 focus
        for (const client of clientList) {
          try {
            const u = new URL(client.url);
            const t = new URL(targetUrl, self.location.origin);
            if (u.pathname === t.pathname && "focus" in client) {
              return client.focus();
            }
          } catch {
            /* ignore */
          }
        }
        // 없으면 새 탭
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
