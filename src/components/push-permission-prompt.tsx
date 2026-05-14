"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { registerPushSubscription } from "@/app/push/actions";

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
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
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
                <strong>이 폰에 알림 등록됨</strong> — 접수·결재 완료·반려 알림을 보내드립니다.
              </>
            ) : isDenied ? (
              <>
                알림이 차단되어 있어요. 휴대폰/브라우저 설정에서 알림을 허용해 주세요.
              </>
            ) : (
              <>
                신청서 진행 상황을 <strong>이 폰의 홈 화면 알림</strong>으로 받기
              </>
            )}
          </span>
        </div>

        {isOn ? (
          <span className="inline-flex min-h-10 flex-none items-center rounded-full bg-emerald-600 px-3 text-sm font-semibold text-white">
            등록됨
          </span>
        ) : (
          <button
            type="button"
            aria-label="알림 허용하기"
            disabled={isBusy || isDenied}
            onClick={enable}
            className={cn(
              "inline-flex min-h-10 flex-none items-center justify-center rounded-full px-3 text-sm font-semibold text-white transition-colors",
              isDenied ? "bg-stone-400" : "bg-brand-600 hover:bg-brand-700",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
            )}
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                등록 중
              </>
            ) : (
              "알림 허용"
            )}
          </button>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
