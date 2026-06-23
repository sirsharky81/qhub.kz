import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMessengerSession } from "@/lib/messenger/session";

export const metadata: Metadata = {
  title: "Мессенджер",
  description: "Закрытый зашифрованный мессенджер QHub",
  robots: { index: false, follow: false },
};

export default async function MessengerPage() {
  const session = await getMessengerSession();
  redirect(session ? "/tools/messenger/home" : "/tools/messenger/login");
}
