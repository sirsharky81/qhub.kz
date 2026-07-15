import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "QHub Split",
  description: "Совместный учёт расходов и балансов",
  manifest: "/tools/split/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QHub Split",
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
