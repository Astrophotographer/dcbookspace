"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 모달 열림 상태를 URL searchParam 에 백업하는 훅.
 * 핵심 효과: 모달에서 detail 페이지로 이동했다가 뒤로가기 누르면 모달이 다시 열림.
 *
 * 동작:
 * - open(id):  history.pushState 로 ?param=id 추가 (Next.js 라우터 안 거침)
 * - close():   history.back() — 직전 상태(보통 ?param 없는 URL) 로 복귀
 * - popstate:  브라우저 back/forward 누르면 URL 의 ?param 값으로 자동 동기화
 *
 * 일부러 Next.js router 가 아닌 native history API 를 쓰는 이유:
 * - router.push 는 server component 재실행 (DB 재조회) 트리거
 * - 우리는 단순 모달 열기/닫기에 그 비용 불필요
 * - 페이지 데이터는 이미 메모리에 있음
 */
export function useUrlModal(
  paramName: string,
): [string | null, (id: string) => void, () => void] {
  const [value, setValue] = useState<string | null>(null);

  // mount 시점에 URL 동기화 + popstate 구독 (뒤로가기 처리)
  useEffect(() => {
    function sync() {
      const url = new URL(window.location.href);
      setValue(url.searchParams.get(paramName));
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [paramName]);

  const open = useCallback(
    (id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set(paramName, id);
      window.history.pushState({}, "", url.toString());
      setValue(id);
    },
    [paramName],
  );

  const close = useCallback(() => {
    // history.back 으로 직전 entry 로 (모달 열기 전 상태). popstate 가 setValue(null) 처리.
    window.history.back();
  }, []);

  return [value, open, close];
}
