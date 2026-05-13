import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // 무거운 패키지의 import 를 Next 가 자동으로 tree-shake.
  // lucide-react: 38 개 파일에서 부분 import — 사용 안 한 아이콘 번들 제외.
  // date-fns:     클라이언트 컴포넌트 5 개에서 사용 — locale 포함 사이즈 감축.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
