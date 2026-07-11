"use client";

import { useEffect, useState } from "react";
import { PinInput } from "./PinInput";
import { MessengerShell } from "./MessengerShell";
import { PIN_LENGTH } from "@/lib/messenger/constants";
import { primeHistoryDb } from "@/lib/messenger/history-db";

interface Props {
  maskedPhone?: string;
  loading?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void | Promise<void>;
}

export function MessengerPinUnlockScreen({
  maskedPhone,
  loading = false,
  error = null,
  onSubmit,
}: Props) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    void primeHistoryDb();
  }, []);

  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  return (
    <MessengerShell variant="app" title="Мессенджер" backHref="/" keyboardAware={false}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <h2 className="text-sm font-semibold text-gray-900">Введите PIN</h2>
            <p className="text-xs text-gray-500 mt-2">
              Один раз при входе в мессенджер на этом устройстве.
            </p>
            {maskedPhone && (
              <p className="text-sm font-medium text-gray-700 mt-3">{maskedPhone}</p>
            )}
          </div>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button
            type="button"
            disabled={loading || pin.length < PIN_LENGTH}
            onClick={() => void onSubmit(pin)}
            className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Проверка…" : "Продолжить"}
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
