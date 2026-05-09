"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/app/push/actions";

type Props = {
  /** 신청자 본인 휴대폰 — 본인 확인용 */
  applicantPhone: string;
};

type State =
  | "init"            // 환경 점검 중
  | "unsupported"     // 푸시 미지원 환경
  | "denied"          // 권한 거부됨 (사용자 또는 OS)
  | "off"             // 미구독 상태
  | "subscribing"     // 권한 요청 + 구독 진행 중
  | "on"              // 구독됨
  | "error";          // 일시 오류

const PUBLIC_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** base64url → Uint8Array — VAPID 공개키 변환.
 * pushManager.subscribe 의 BufferSource 타입(ArrayBuffer 한정) 매칭을 위해
 * Uint8Array<ArrayBuffer> 로 명시 (TS 5.7+ narrowing).
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushPermissionPrompt({ applicantPhone }: Props) {
  const [state, setState] = useState<State>("init");
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 환경 + 현재 구독 상태 점검
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      // PWA 푸시 지원 환경:
      // - serviceWorker
      // - PushManager
      // - Notification API
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported || !PUBLIC_VAPID) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!reg) {
          if (!cancelled) setState("off");
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setError(null);
    setState("subscribing");
    try {
      // SW 미등록이면 등록부터
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      }

      // 권한 요청
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }

      // 구독 (이미 있으면 그대로 사용)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID!),
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("구독 정보가 비어있습니다.");
      }

      const res = await registerPushSubscription({
        phone: applicantPhone,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      if (res.error) {
        setError(res.error);
        setState("error");
        // 서버 등록 실패 시 클라 구독도 정리
        await sub.unsubscribe().catch(() => {});
        return;
      }
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 등록 중 오류가 발생했습니다.");
      setState("error");
    }
  };

  const disable = async () => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unregisterPushSubscription({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 해제 중 오류가 발생했습니다.");
      setState("error");
    }
  };

  if (state === "init" || state === "unsupported") return null;

  const isOn = state === "on";
  const isBusy = state === "subscribing";
  const isDenied = state === "denied";

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isOn
          ? "border-emerald-200 bg-emerald-50"
          : isDenied
            ? "border-stone-200 bg-stone-50"
            : "border-brand-200 bg-brand-50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="push-toggle"
          className="flex min-w-0 flex-1 items-center gap-2 text-sm"
        >
          {isOn ? (
            <Bell className="h-4 w-4 flex-none text-emerald-600" />
          ) : isDenied ? (
            <BellOff className="h-4 w-4 flex-none text-stone-500" />
          ) : (
            <Bell className="h-4 w-4 flex-none text-brand-600" />
          )}
          <span
            className={cn(
              "leading-relaxed",
              isOn
                ? "text-emerald-900"
                : isDenied
                  ? "text-stone-700"
                  : "text-brand-900",
            )}
          >
            {isOn ? (
              <>
                <strong>결재 알림 받는 중</strong> — 결재 완료·반려, 같은 시간 강제 신청 시 즉시 알림
              </>
            ) : isDenied ? (
              <>
                알림이 차단되어 있어요. 주소창 자물쇠 → 알림 → 허용으로 변경해 주세요.
              </>
            ) : (
              <>
                결재 완료·반려, 누군가 같은 시간에 신청 시 <strong>홈 화면에 알림</strong>으로 받기
              </>
            )}
          </span>
        </label>

        <button
          id="push-toggle"
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={isOn ? "알림 끄기" : "알림 켜기"}
          disabled={isBusy || isDenied}
          onClick={isOn ? disable : enable}
          className={cn(
            "relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors",
            isOn ? "bg-emerald-500" : "bg-stone-300",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
              isOn ? "translate-x-6" : "translate-x-1",
            )}
          />
          {isBusy && (
            <Loader2 className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
          )}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
