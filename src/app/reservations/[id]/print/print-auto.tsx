"use client";

import { useEffect } from "react";

export function PrintAuto() {
  useEffect(() => {
    // 페이지 진입 직후 인쇄 다이얼로그를 띄우면 안 되도록 약간 지연
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
