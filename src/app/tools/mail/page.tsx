"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchMailSession } from "@/lib/mail/web/client";

export default function MailEntryPage() {
  const router = useRouter();

  useEffect(() => {
    void fetchMailSession().then((session) => {
      router.replace(session.loggedIn ? "/tools/mail/inbox" : "/tools/mail/login");
    });
  }, [router]);

  return (
    <div className="dark min-h-[100dvh] flex items-center justify-center bg-black text-zinc-400 text-sm">
      Загрузка…
    </div>
  );
}
