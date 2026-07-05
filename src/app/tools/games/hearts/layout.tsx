import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/games/hearts";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Червы",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${ICON_BASE}/icon.svg`, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function HeartsLayout({ children }: { children: ReactNode }) {
  return children;
}
