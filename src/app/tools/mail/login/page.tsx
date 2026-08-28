import type { Metadata } from "next";
import { MailLoginClient } from "./MailLoginClient";

export const metadata: Metadata = {
  title: "Вход — Почта QHub",
  robots: { index: false, follow: false },
};

export default function MailLoginPage() {
  return <MailLoginClient />;
}
