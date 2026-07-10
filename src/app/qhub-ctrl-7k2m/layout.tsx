import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";

const ICON_BASE = `/${ADMIN_PANEL_PATH}`;

export const metadata: Metadata = {
  title: "QHub Панель",
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Панель",
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
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return children;
}
