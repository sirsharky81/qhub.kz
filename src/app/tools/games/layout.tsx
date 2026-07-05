import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/games";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QHub Games",
  },
  icons: {
    icon: [
      { url: `${ICON_BASE}/icon-192.png`, type: "image/png", sizes: "192x192" },
      { url: `${ICON_BASE}/icon-512.png`, type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function GamesLayout({ children }: { children: ReactNode }) {
  return children;
}
