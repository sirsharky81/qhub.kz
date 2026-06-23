import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/messenger";

export const metadata: Metadata = {
  title: "Мессенджер",
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Мессенджер",
  },
  icons: {
    icon: [
      { url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" },
    ],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function MessengerLayout({ children }: { children: ReactNode }) {
  return children;
}
