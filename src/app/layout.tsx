import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import InstallBanner from "@/components/InstallBanner";
import PWAProvider from "@/components/PWAProvider";
import { AppProviders } from "@/components/providers/AppProviders";
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
    statusBarStyle: "default",
    title: "QHub",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-tap-highlight": "no",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
  themeColor: "#ffffff",
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
        <AppProviders>{children}</AppProviders>
        <InstallBanner />
      </body>
    </html>
  );
}
