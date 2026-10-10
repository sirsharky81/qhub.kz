import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const ICON_BASE = "/tools/mitsubishi-diag";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mitsu Diag",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function MitsubishiDiagLayout({ children }: { children: ReactNode }) {
  return children;
}
