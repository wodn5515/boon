import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard Variable — 한글 본문 가독성과 시각적 균형이 좋아 PRD §6에 채택된 폰트.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
  weight: "45 920",
});

export const metadata: Metadata = {
  title: "Boon · 받은 신세 노트",
  description:
    "받은 마음이 바람처럼 분다. 친구한테 받은 신세를 기록하는 1인용 회상 노트.",
};

export const viewport: Viewport = {
  themeColor: "#FAF7F0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
