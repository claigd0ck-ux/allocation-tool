import type { NextConfig } from "next";

/** 보안 점검 낮음 8번 — 모든 응답에 붙이는 보안 헤더 */
const securityHeaders = [
  // 다른 사이트가 이 툴을 화면 안에 끼워 넣지 못하게 (클릭 가로채기 방지)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  // 파일 종류를 브라우저가 멋대로 추측하지 않게
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 다른 사이트로 이동할 때 이 툴 주소를 넘기지 않게
  { key: "Referrer-Policy", value: "no-referrer" },
  // 카메라·마이크·위치는 쓰지 않는다
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // 검색엔진에 올리지 않는다 (업무용 도구)
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
