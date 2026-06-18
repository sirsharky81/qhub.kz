import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/music";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QHub Music",
  },
  icons: {
    icon: [
      { url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${ICON_BASE}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
};

export default function MusicLayout({ children }: { children: ReactNode }) {
  return children;
}
