"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loginMessenger } from "@/lib/messenger/client";
import { deriveStorageKey } from "@/lib/messenger/storage-key";

interface UnlockContextValue {
  storageKey: CryptoKey | null;
  isUnlocked: boolean;
  unlockWithPin: (phone: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  setStorageKeyFromPin: (pin: string) => Promise<boolean>;
  lock: () => void;
}

const MessengerUnlockContext = createContext<UnlockContextValue | null>(null);

export function MessengerUnlockProvider({ children }: { children: ReactNode }) {
  const [storageKey, setStorageKey] = useState<CryptoKey | null>(null);

  const unlockWithPin = useCallback(async (phone: string, pin: string) => {
    const res = await loginMessenger(phone, pin);
    if (!res.ok) {
      return { ok: false, error: res.error ?? "Неверный PIN" };
    }
    try {
      const key = await deriveStorageKey(pin);
      setStorageKey(key);
      return { ok: true };
    } catch {
      return { ok: false, error: "Не удалось разблокировать историю" };
    }
  }, []);

  const setStorageKeyFromPin = useCallback(async (pin: string) => {
    try {
      const key = await deriveStorageKey(pin);
      setStorageKey(key);
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    setStorageKey(null);
  }, []);

  const value = useMemo(
    () => ({
      storageKey,
      isUnlocked: storageKey !== null,
      unlockWithPin,
      setStorageKeyFromPin,
      lock,
    }),
    [storageKey, unlockWithPin, setStorageKeyFromPin, lock],
  );

  return (
    <MessengerUnlockContext.Provider value={value}>{children}</MessengerUnlockContext.Provider>
  );
}

export function useMessengerUnlock(): UnlockContextValue {
  const ctx = useContext(MessengerUnlockContext);
  if (!ctx) {
    throw new Error("useMessengerUnlock must be used within MessengerUnlockProvider");
  }
  return ctx;
}

export function useMessengerUnlockOptional(): UnlockContextValue | null {
  return useContext(MessengerUnlockContext);
}
