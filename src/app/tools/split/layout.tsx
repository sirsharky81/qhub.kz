import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QHub Split",
  description: "Совместный учёт расходов и балансов",
  manifest: "/tools/split/manifest.json",
};

export default function SplitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
