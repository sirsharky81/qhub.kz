import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { readNextBuildId } from "@/lib/obd-diag/read-build-id";
import { ObdScrollShell } from "../obd-diag/ObdScrollShell";

export const dynamic = "force-dynamic";

const ICON_BASE = "/tools/subaru-coding";

export const metadata: Metadata = {
  manifest: `${ICON_BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Subaru Coding & Immo",
  },
  icons: {
    icon: [{ url: `${ICON_BASE}/icon-192.png?v=4`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png?v=4`, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  interactiveWidget: "resizes-visual",
};

export default function SubaruCodingLayout({ children }: { children: ReactNode }) {
  const pageBuildId = readNextBuildId();
  return (
    <ObdScrollShell
      pageBuildId={pageBuildId}
      title="Subaru Coding"
      iconSrc="/tools/subaru-coding/icon-192.png?v=4"
    >
      {children}
    </ObdScrollShell>
  );
}
