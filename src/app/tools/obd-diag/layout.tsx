import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ObdScrollShell } from "./ObdScrollShell";

const ICON_BASE = "/tools/obd-diag";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OBD Scanner",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // Keep the layout height still while the browser chrome shows and hides.
  interactiveWidget: "resizes-visual",
};

export default function ObdDiagLayout({ children }: { children: ReactNode }) {
  return <ObdScrollShell>{children}</ObdScrollShell>;
}
