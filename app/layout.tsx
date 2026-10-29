import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "적립금 배분 툴",
  description: "예치기관별 적립금 목표 배분안과 자금 이동 방법을 계산하는 실무자용 도구",
  // 업무용 도구라 검색엔진에 올리지 않는다
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
