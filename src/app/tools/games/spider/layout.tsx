import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/games";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Паук",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#BBCFC3",
};

export default function SpiderLayout({ children }: { children: ReactNode }) {
  return children;
}
