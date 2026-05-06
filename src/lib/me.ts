"use client";

import { useSyncExternalStore } from "react";

// 사용자 계정이 없는 시스템에서 "내가 작성한 신청서" 식별을 위한 약식 owner 표시.
// localStorage 에 마지막 신청자 이름/휴대폰을 저장. 서버는 이걸 받아서 신청서의
// applicant 와 매칭되는지 확인한다(약식 검증 — 실제 인증은 결재자 PIN 흐름이 담당).
const KEY = "dcbookspace.me";

export type Me = { name: string; phone: string };

function safeParse(raw: string | null): Me | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.name === "string" && typeof v?.phone === "string") {
      return { name: v.name, phone: v.phone };
    }
  } catch {
    // ignore
  }
  return null;
}

export function getMe(): Me | null {
  if (typeof window === "undefined") return null;
  return safeParse(window.localStorage.getItem(KEY));
}

export function setMe(me: Me) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(me));
}

export function clearMe() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function isOwner(
  me: Me | null,
  applicant: { name: string; phone: string | null },
): boolean {
  if (!me) return false;
  if (!applicant.phone) return false;
  return me.name === applicant.name && me.phone === applicant.phone;
}

// localStorage 변화 구독. 다른 탭에서 신청을 새로 보내면 storage 이벤트가 발생.
function subscribeMe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
const NEVER_SUBSCRIBE = () => () => {};

/**
 * 클라이언트 me 정보 + 하이드레이션 완료 여부.
 * - hydrated=false (SSR/하이드레이션 중): "로딩" 상태 그리기
 * - hydrated=true 이후 me 가 null 이면 "내 신청 표시 없음"
 *
 * useEffect 안에서 setState 하지 않도록 useSyncExternalStore 사용.
 */
export function useMe(): { me: Me | null; hydrated: boolean } {
  const me = useSyncExternalStore(
    subscribeMe,
    () => getMe(),
    () => null,
  );
  const hydrated = useSyncExternalStore(
    NEVER_SUBSCRIBE,
    () => true,
    () => false,
  );
  return { me, hydrated };
}
