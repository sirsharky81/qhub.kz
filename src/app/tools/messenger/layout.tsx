import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MessengerUnlockProvider } from "./components/MessengerUnlockProvider";

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
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Keeps layout viewport above the virtual keyboard on supported mobile browsers.
  interactiveWidget: "resizes-content",
};

export default function MessengerLayout({ children }: { children: ReactNode }) {
  return <MessengerUnlockProvider>{children}</MessengerUnlockProvider>;
}
