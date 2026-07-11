"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchAccessCheck } from "@/lib/messenger/client";
import { maskPhone } from "@/lib/messenger/phone-format";
import { useMessengerUnlock } from "./MessengerUnlockProvider";
import { MessengerPinUnlockScreen } from "./MessengerPinUnlockScreen";

function isLoginPath(pathname: string): boolean {
  return pathname === "/tools/messenger/login" || pathname.startsWith("/tools/messenger/login/");
}

interface Props {
  children: ReactNode;
}

export function MessengerAppUnlockGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isUnlocked, unlockWithPin } = useMessengerUnlock();
  const [checking, setChecking] = useState(!isLoginPath(pathname));
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [phone, setPhone] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoginPath(pathname)) {
      setChecking(false);
      setNeedsUnlock(false);
      return;
    }

    if (isUnlocked) {
      setChecking(false);
      setNeedsUnlock(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    void fetchAccessCheck(true)
      .then((data) => {
        if (cancelled) return;
        if (!data.messengerLoggedIn) {
          setNeedsUnlock(false);
          return;
        }
        if (data.mustChangePin) {
          router.replace("/tools/messenger/login");
          return;
        }
        if (data.phone) {
          setPhone(data.phone);
          setMaskedPhone(maskPhone(data.phone));
        }
        setNeedsUnlock(true);
      })
      .catch(() => {
        if (!cancelled) setNeedsUnlock(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, isUnlocked, router]);

  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  if (!needsUnlock || isUnlocked) {
    return <>{children}</>;
  }

  async function handleUnlock(pin: string) {
    if (!phone) return;
    setError(null);
    setLoading(true);
    try {
      const res = await unlockWithPin(phone, pin);
      if (!res.ok) {
        if (res.error?.includes("Сессия истекла")) {
          router.replace("/tools/messenger/login");
          return;
        }
        setError(res.error ?? "Неверный PIN");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <MessengerPinUnlockScreen
      maskedPhone={maskedPhone}
      loading={loading}
      error={error}
      onSubmit={handleUnlock}
    />
  );
}
