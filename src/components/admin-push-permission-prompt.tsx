"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  registerAdminPushSubscription,
  unregisterPushSubscription,
} from "@/app/push/actions";

type AdminLite = { id: string; name: string };

type Props = {
  admins: AdminLite[];
};

type State =
  | "init"
  | "unsupported"
  | "denied"
  | "off"
  | "subscribing"
  | "on"
  | "error";

const PUBLIC_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const SELECTED_ADMIN_KEY = "dcbookspace.push.adminUserId";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * 관리자 폰을 admin role 푸시 알림 수신처로 등록하는 토글.
 *
 * 흐름:
 *  - admin user 가 1명 → 자동 선택, 셀렉트 숨김
 *  - 여러 명 + 마지막 선택 캐시 있음 → 그 admin 으로 자동 선택, 셀렉트 숨김 (변경 링크로 다시 노출)
 *  - 여러 명 + 캐시 없음 → 셀렉트 1회 노출 → 선택 시 캐시 저장
 *  - 토글 ON  → 권한 요청 + endpoint 등록
 *  - 토글 OFF → DB 삭제 + browser unsubscribe (선택값은 유지)
 */
export function AdminPushPermissionPrompt({ admins }: Props) {
  const [state, setState] = useState<State>("init");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  // 셀렉트 강제 노출 ("변경" 클릭 시)
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;

      // 자동 선택: admin 1명이면 무조건 / 여러명이면 캐시 우선, 없으면 빈 값(셀렉트 노출)
      let initialId = "";
      if (admins.length === 1) {
        initialId = admins[0].id;
      } else if (admins.length > 1) {
        try {
          const cached = window.localStorage.getItem(SELECTED_ADMIN_KEY);
          if (cached && admins.some((a) => a.id === cached)) initialId = cached;
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setSelectedId(initialId);

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
  }, [admins]);

  const enable = async () => {
    if (!selectedId) {
      setError("등록할 관리자 본인을 먼저 선택해주세요.");
      setState("error");
      return;
    }
    setError(null);
    setState("subscribing");
    try {
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
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
      const res = await registerAdminPushSubscription({
        adminUserId: selectedId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      if (res.error) {
        setError(res.error);
        setState("error");
        await sub.unsubscribe().catch(() => {});
        return;
      }
      try {
        window.localStorage.setItem(SELECTED_ADMIN_KEY, selectedId);
      } catch {
        /* ignore */
      }
      setPickerOpen(false);
      setState("on");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "알림 등록 중 오류가 발생했습니다.",
      );
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
      setError(
        e instanceof Error ? e.message : "알림 해제 중 오류가 발생했습니다.",
      );
      setState("error");
    }
  };

  if (state === "init") {
    return (
      <div className="flex h-12 items-center justify-center text-sm text-stone-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        준비 중…
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
        이 브라우저는 푸시 알림을 지원하지 않거나, 알림 키가 아직 설정되지
        않았습니다.
      </div>
    );
  }

  const isOn = state === "on";
  const isBusy = state === "subscribing";
  const isDenied = state === "denied";
  const selectedAdmin = admins.find((a) => a.id === selectedId);

  // 셀렉트 노출 조건:
  //   - 관리자 여러 명이고 (캐시 또는 자동 선택이 있어도 변경 가능하도록)
  //   - 등록 안 된 상태(off/error)에서 selectedId 가 없거나 pickerOpen 일 때
  //   - 또는 관리자가 0명인 비정상 케이스
  const showPicker =
    admins.length > 1 && (!isOn || pickerOpen) && (pickerOpen || !selectedId);

  return (
    <div className="space-y-3">
      {/* 본문 토글 박스 */}
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
                  <strong>알림 받는 중</strong>
                  {selectedAdmin && ` · ${selectedAdmin.name}`}
                </>
              ) : isDenied ? (
                <>알림이 차단되어 있어요. 주소창 자물쇠 → 알림 → 허용으로 변경해 주세요.</>
              ) : (
                <>이 폰에 강제 중복 신청 알림 받기</>
              )}
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? "알림 끄기" : "알림 켜기"}
            disabled={
              isBusy ||
              isDenied ||
              admins.length === 0 ||
              (admins.length > 1 && !selectedId)
            }
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

        {/* 켜진 상태에서 admin 변경하고 싶을 때 */}
        {isOn && admins.length > 1 && !pickerOpen && (
          <div className="mt-2 text-xs text-emerald-700">
            <button
              type="button"
              onClick={async () => {
                // 변경하려면 일단 끄고 다시 선택
                await disable();
                setPickerOpen(true);
              }}
              className="underline hover:text-emerald-900"
            >
              다른 관리자로 등록하기
            </button>
          </div>
        )}
      </div>

      {/* 셀렉트 — 여러 명 + 미선택/변경 모드일 때만 */}
      {showPicker && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-stone-700">
              누구의 폰인가요?
            </span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-base"
            >
              <option value="">선택하세요</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-stone-500">
            한 번 선택하면 이 폰에서는 다음부터 자동으로 같은 관리자로 등록됩니다.
          </p>
        </div>
      )}

      {error && <div className="text-xs text-red-700">{error}</div>}

      {admins.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          등록된 관리자(admin)가 없습니다. 관리자정보 페이지에서 먼저 추가해
          주세요.
        </div>
      )}
    </div>
  );
}
