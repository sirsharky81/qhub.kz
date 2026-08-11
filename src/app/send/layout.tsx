import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "QHub Send",
  description: "Отправка файлов по ссылке — хранение на NAS",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function SendLayout({ children }: { children: ReactNode }) {
  return children;
}
