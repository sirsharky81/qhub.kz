import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/games";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Автослалом",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#c8d4c4",
};

export default function AutoslalomLayout({ children }: { children: ReactNode }) {
  return children;
}
