import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import InstallBanner from "@/components/InstallBanner";
import PWAProvider from "@/components/PWAProvider";
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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QHub",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-tap-highlight": "no",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  title: "QHub.kz — Первый казахский хаб полезных приложений",
  description:
    "QHub.kz — платформа с умными веб-приложениями для жизни, работы и бизнеса. Кредитный калькулятор, финансовые инструменты и другие vibe-coded решения.",
  keywords: ["QHub", "Казахстан", "веб-приложения", "кредитный калькулятор", "vibe coding"],
  openGraph: {
    title: "QHub.kz — Первый казахский хаб полезных приложений",
    description: "Умные инструменты для жизни и работы, созданные с душой.",
    url: "https://qhub.kz",
    siteName: "QHub.kz",
    locale: "ru_KZ",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <PWAProvider />
        {children}
        <InstallBanner />
      </body>
    </html>
  );
}
