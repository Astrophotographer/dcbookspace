import { ImageResponse } from "next/og";

// Next 가 자동으로 <link rel="icon"> 을 만들어 head 에 주입하고, manifest 의
// icons 배열도 이 URL 을 가리키게 두면 Android / Chrome / Edge 가 알아서 사용.
// Satori 로 JSX → PNG 렌더 → cold start 1회 비용만 부담 (이후 캐싱).

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1e3a8a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* 교회 실루엣 + 십자가 — 단순한 도형으로 작은 크기에서도 또렷 */}
        <svg
          width="360"
          height="360"
          viewBox="0 0 360 360"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 십자가 */}
          <rect x="166" y="20" width="28" height="120" rx="4" fill="white" />
          <rect x="138" y="56" width="84" height="28" rx="4" fill="white" />
          {/* 지붕 */}
          <polygon points="20,180 180,80 340,180" fill="white" />
          {/* 본체 */}
          <rect x="36" y="172" width="288" height="168" fill="white" />
          {/* 출입문 (음각) */}
          <path
            d="M 150 240 Q 150 210 180 210 Q 210 210 210 240 L 210 340 L 150 340 Z"
            fill="#1e3a8a"
          />
          {/* 양쪽 둥근 창 */}
          <circle cx="84" cy="252" r="22" fill="#1e3a8a" />
          <circle cx="276" cy="252" r="22" fill="#1e3a8a" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
