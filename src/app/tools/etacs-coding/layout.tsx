import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/etacs-coding";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mitsubishi ETACS",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#c41e1e",
};

export default function EtacsCodingLayout({ children }: { children: ReactNode }) {
  return children;
}
