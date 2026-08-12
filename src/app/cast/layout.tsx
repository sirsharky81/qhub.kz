import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/cast";

export const metadata: Metadata = {
  title: "QHub Cast",
  description: "Вещание видео на TV через Chromecast — QHub",
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cast",
  },
  icons: {
    icon: [
      { url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${ICON_BASE}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function CastLayout({ children }: { children: ReactNode }) {
  return children;
}
