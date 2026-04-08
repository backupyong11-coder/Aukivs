import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "웹툰 운영 관제실",
  description:
    "PC 관제판에서 버튼으로 조회하고, 체크·업로드 화면에서 시트를 편집하는 웹툰 운영 도구",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col md:flex-row">
        <AppNav showDemoLogout={Boolean(process.env.DEMO_PIN?.trim())} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
