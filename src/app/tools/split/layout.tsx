import type { Metadata, Viewport } from "next";

import {
  SPLIT_BRANDED_NAME,
  SPLIT_PWA_SHORT_NAME,
  SPLIT_PRODUCT_TAGLINE,
} from "@/lib/split/constants";

export const metadata: Metadata = {
  title: SPLIT_BRANDED_NAME,
  description: SPLIT_PRODUCT_TAGLINE,
  manifest: "/tools/split/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SPLIT_PWA_SHORT_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: "#e8f0ec",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Keep layout height stable; only visualViewport shrinks with keyboard (iOS PWA).
  interactiveWidget: "resizes-visual",
};

export default function SplitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
