"use client";

import { useState } from "react";
import { PinInput } from "./PinInput";
import { MessengerShell } from "./MessengerShell";
import { useMessengerUnlock } from "./MessengerUnlockProvider";
import { PIN_LENGTH } from "@/lib/messenger/constants";

interface Props {
  phone: string;
  maskedPhone?: string;
  title: string;
  backHref: string;
  children: React.ReactNode;
}

export function PinUnlockGate({ phone, maskedPhone, title, backHref, children }: Props) {
  const { isUnlocked, unlockWithPin } = useMessengerUnlock();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isUnlocked) {
    return <>{children}</>;
  }

  async function handleUnlock() {
    setError(null);
    setLoading(true);
    try {
      const res = await unlockWithPin(phone, pin);
      if (!res.ok) {
        setError(res.error ?? "Неверный PIN");
        setPin("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <MessengerShell variant="chat" title={title} backHref={backHref} keyboardAware={false}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <h2 className="text-sm font-semibold text-gray-900">Разблокировать чат</h2>
            <p className="text-xs text-gray-500 mt-2">
              Введите PIN, чтобы открыть сохранённую переписку на этом устройстве.
            </p>
            {maskedPhone && (
              <p className="text-sm font-medium text-gray-700 mt-3">{maskedPhone}</p>
            )}
          </div>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button
            type="button"
            disabled={loading || pin.length < PIN_LENGTH}
            onClick={() => void handleUnlock()}
            className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Проверка…" : "Разблокировать"}
          </button>
          {error && (
            <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </MessengerShell>
  );
}
