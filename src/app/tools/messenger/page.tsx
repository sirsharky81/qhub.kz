"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchAccessCheck } from "@/lib/messenger/client";

export default function MessengerEntryPage() {
  const router = useRouter();

  useEffect(() => {
    void fetchAccessCheck(true).then((data) => {
      router.replace(data.messengerLoggedIn ? "/tools/messenger/home" : "/tools/messenger/login");
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      Загрузка…
    </div>
  );
}
