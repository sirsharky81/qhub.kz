"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchAccessCheck } from "@/lib/messenger/client";

export default function MessengerEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      router.replace("/tools/messenger/login");
    }, 7000);
    void fetchAccessCheck(true)
      .then((data) => {
        if (cancelled || settled) return;
        settled = true;
        router.replace(data.messengerLoggedIn ? "/tools/messenger/home" : "/tools/messenger/login");
      })
      .catch(() => {
        if (cancelled || settled) return;
        settled = true;
        router.replace("/tools/messenger/login");
      })
      .finally(() => {
        clearTimeout(fallbackTimer);
      });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      Загрузка…
    </div>
  );
}
