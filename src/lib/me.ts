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
  // 같은 탭에서 호출했을 때 storage 이벤트가 안 떠서 캐시 무효화 + 구독자 직접 알림
  invalidateMeCache();
}

export function clearMe() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  invalidateMeCache();
}

export function isOwner(
  me: Me | null,
  applicant: { name: string; phone: string | null },
): boolean {
  if (!me) return false;
  if (!applicant.phone) return false;
  return me.name === applicant.name && me.phone === applicant.phone;
}

// 같은 탭에서 setMe/clearMe 가 호출되면 storage 이벤트가 안 떠서 직접 알려야 함.
// 작은 in-memory pub/sub.
const localSubs = new Set<() => void>();
function notifyLocal() {
  for (const s of localSubs) s();
}

// localStorage 변화 구독. 다른 탭에서 신청을 새로 보내면 storage 이벤트도 같이 캐치.
function subscribeMe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  localSubs.add(cb);
  return () => {
    window.removeEventListener("storage", cb);
    localSubs.delete(cb);
  };
}
const NEVER_SUBSCRIBE = () => () => {};

// useSyncExternalStore 는 snapshot 함수가 호출될 때마다 같은 값에 대해
// 같은 reference 를 돌려줘야 한다 (Object.is 비교). JSON.parse 는 매번 새 객체를
// 만들어내서 무한 루프를 유발하므로 raw 문자열을 키로 캐싱한다.
let cachedRaw: string | null | undefined = undefined; // undefined = 아직 미초기화
let cachedMe: Me | null = null;

function getMeSnapshot(): Me | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cachedRaw) return cachedMe;
  cachedRaw = raw;
  cachedMe = safeParse(raw);
  return cachedMe;
}

function invalidateMeCache() {
  cachedRaw = undefined;
  cachedMe = null;
  notifyLocal();
}

const SERVER_ME: Me | null = null;

/**
 * 클라이언트 me 정보 + 하이드레이션 완료 여부.
 * - hydrated=false (SSR/하이드레이션 중): "로딩" 상태 그리기
 * - hydrated=true 이후 me 가 null 이면 "내 신청 표시 없음"
 */
export function useMe(): { me: Me | null; hydrated: boolean } {
  const me = useSyncExternalStore(
    subscribeMe,
    getMeSnapshot,
    () => SERVER_ME,
  );
  const hydrated = useSyncExternalStore(
    NEVER_SUBSCRIBE,
    () => true,
    () => false,
  );
  return { me, hydrated };
}
