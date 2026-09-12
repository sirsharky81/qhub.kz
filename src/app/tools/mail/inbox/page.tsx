import type { Metadata } from "next";
import { MailAppClient } from "./MailAppClient";

export const metadata: Metadata = {
  title: "Почта QHub",
  robots: { index: false, follow: false },
};

export default function MailInboxPage() {
  return <MailAppClient />;
}
