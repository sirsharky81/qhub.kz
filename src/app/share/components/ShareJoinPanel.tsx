"use client";

import Link from "next/link";
import { useState } from "react";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import type { NearbyShareRoom } from "@/lib/share/client";
import { looksLikeShareInvite } from "@/lib/share/join-input";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";

interface Props {
  joinInput: string;
  joinPin: string;
  busy: boolean;
  nearbyRooms: NearbyShareRoom[];
  nearbyLoading: boolean;
  lanPrefer: boolean;
  onLanPreferChange: (value: boolean) => void;
  onJoinInputChange: (value: string) => void;
  onJoinPinChange: (value: string) => void;
  onJoin: () => void;
  onNearbyJoin: (roomCode: string) => void;
}

const inputClass = `w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm ${MOBILE_SAFE_INPUT_CLASS}`;

export function ShareJoinPanel({
  joinInput,
  joinPin,
  busy,
  nearbyRooms,
  nearbyLoading,
  lanPrefer,
  onLanPreferChange,
  onJoinInputChange,
  onJoinPinChange,
  onJoin,
  onNearbyJoin,
}: Props) {
  const [pinOpen, setPinOpen] = useState(Boolean(joinPin));
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const scanHref = `${CODE_SCANNER_SIMPLE_URL}&returnTo=${encodeURIComponent("/share")}`;
  const canJoin = looksLikeShareInvite(joinInput);

  async function handlePaste() {
    setPasteHint(null);
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) {
        setPasteHint("Буфер обмена пуст");
        return;
      }
      onJoinInputChange(trimmed);
      setPasteHint("Вставлено");
      window.setTimeout(() => setPasteHint(null), 1500);
    } catch {
      setPasteHint("Разрешите доступ к буферу обмена");
    }
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50/80 to-white p-4 space-y-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Подключиться к комнате</h2>
        <p className="text-xs text-gray-500 mt-0.5">Сканируйте QR, введите код или вставьте ссылку</p>
      </div>

      <Link
        href={scanHref}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-sky-600 text-white py-3.5 text-sm font-semibold active:bg-sky-700"
      >
        <span aria-hidden className="text-lg leading-none">
          📷
        </span>
        Сканировать QR
      </Link>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Код комнаты или ссылка</span>
          <div className="mt-1 flex gap-2">
            <input
              value={joinInput}
              onChange={(e) => onJoinInputChange(e.target.value)}
              placeholder="breeze-galaxy-73"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
              className={`${inputClass} font-mono flex-1 min-w-0`}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canJoin && !busy) {
                  e.preventDefault();
                  onJoin();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handlePaste()}
              disabled={busy}
              className="shrink-0 rounded-xl border border-gray-300 bg-white px-3 py-3 text-xs font-semibold text-gray-700 active:bg-gray-50 disabled:opacity-50"
            >
              Вставить
            </button>
          </div>
        </label>
        {pasteHint && <p className="text-[11px] text-sky-700">{pasteHint}</p>}
      </div>

      {!pinOpen ? (
        <button
          type="button"
          onClick={() => setPinOpen(true)}
          className="text-xs text-gray-500 underline underline-offset-2"
        >
          Комната с PIN?
        </button>
      ) : (
        <label className="block">
          <span className="text-xs font-medium text-gray-600">PIN комнаты</span>
          <input
            value={joinPin}
            onChange={(e) => onJoinPinChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="4–8 цифр"
            enterKeyHint="done"
            className={`mt-1 ${inputClass}`}
            disabled={busy}
          />
        </label>
      )}

      <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={lanPrefer}
          onChange={(e) => onLanPreferChange(e.target.checked)}
          disabled={busy}
          className="mt-0.5"
        />
        <span className="text-xs text-emerald-950 leading-snug">
          <span className="font-semibold">Быстрая локальная передача</span>
          <br />
          Одна Wi‑Fi, без VPN. Прямое P2P вместо медленного relay через интернет.
        </span>
      </label>

      <button
        type="button"
        disabled={busy || !canJoin}
        onClick={onJoin}
        className="w-full rounded-xl bg-gray-900 text-white py-3.5 text-sm font-semibold disabled:opacity-40 active:bg-gray-800"
      >
        {busy ? "Подключение…" : "Подключиться"}
      </button>

      {(nearbyLoading || nearbyRooms.length > 0) && (
        <div className="pt-1 border-t border-sky-100 space-y-2">
          <p className="text-xs font-medium text-violet-900">Рядом в сети</p>
          {nearbyLoading ? (
            <p className="text-xs text-gray-500">Поиск…</p>
          ) : (
            <ul className="space-y-1.5">
              {nearbyRooms.map((room) => (
                <li key={room.roomId}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onNearbyJoin(room.roomCode)}
                    className="w-full text-left rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 text-sm active:bg-violet-100 disabled:opacity-50"
                  >
                    <span className="font-mono font-semibold text-violet-950">{room.roomCode}</span>
                    <span className="text-gray-600"> · {room.deviceName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
