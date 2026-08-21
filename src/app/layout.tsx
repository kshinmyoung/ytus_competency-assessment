import type { Metadata } from "next";
import { Gothic_A1, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";
import PageViewTracker from "@/components/PageViewTracker";

/* 제목 — 학교 사이트의 굵은 고딕 계열을 잇는다 */
const gothicA1 = Gothic_A1({
  variable: "--font-gothic-a1",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

/* 본문 — 기본 산세리프를 피한 설계적 인상 */
const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/* 수치·좌표 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "YOUNG SHINY — 영남신학대학교 역량관리시스템",
  description:
    "Y-COMPASS 2030. 나의 역량이 어디까지 왔는지 확인하고, 다음 방향을 찾습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${gothicA1.variable} ${plexKr.variable} ${plexMono.variable} antialiased`}>
        <PageViewTracker />
        {children}
      </body>
    </html>
  );
}
