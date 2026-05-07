import { ImageResponse } from "next/og";

// iOS Safari "홈 화면에 추가" 시 쓰는 아이콘. 180x180 PNG 권장. 모서리는 iOS 가
// 자동 마스킹하므로 별도 borderRadius 불필요 — 안전 영역 안에 콘텐츠를 둠.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg
          width="130"
          height="130"
          viewBox="0 0 360 360"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="166" y="20" width="28" height="120" rx="4" fill="white" />
          <rect x="138" y="56" width="84" height="28" rx="4" fill="white" />
          <polygon points="20,180 180,80 340,180" fill="white" />
          <rect x="36" y="172" width="288" height="168" fill="white" />
          <path
            d="M 150 240 Q 150 210 180 210 Q 210 210 210 240 L 210 340 L 150 340 Z"
            fill="#1e3a8a"
          />
          <circle cx="84" cy="252" r="22" fill="#1e3a8a" />
          <circle cx="276" cy="252" r="22" fill="#1e3a8a" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
