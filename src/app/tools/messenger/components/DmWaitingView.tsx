"use client";

import Link from "next/link";
import { MessengerShell } from "./MessengerShell";

interface Props {
  peerTitle: string;
  checking: boolean;
  onCheckNow: () => void;
}

export function DmWaitingView({ peerTitle, checking, onCheckNow }: Props) {
  return (
    <MessengerShell variant="chat" title={peerTitle} backHref="/tools/messenger/home">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="flex items-center gap-2 text-sm text-sky-700 mb-6">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
          </span>
          Ожидание собеседника…
        </div>

        <div className="max-w-sm space-y-3 text-sm text-gray-600">
          <p>
            Личные сообщения шифруются на устройствах. Собеседник должен хотя бы раз войти в
            мессенджер — тогда чат откроется автоматически.
          </p>
          <p className="text-xs text-gray-500">
            Если он ещё не получал ссылку, попросите администратора отправить ссылку на{" "}
            <span className="font-mono text-gray-700">/tools/messenger</span>
          </p>
          <p className="text-xs text-gray-500">
            Если собеседник уже входил раньше, но сейчас оффлайн — можно подождать или вернуться
            позже: чат откроется, как только его ключ появится на сервере.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
          <button
            type="button"
            disabled={checking}
            onClick={onCheckNow}
            className="w-full rounded-2xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            {checking ? "Проверка…" : "Проверить сейчас"}
          </button>
          <Link
            href="/tools/messenger/home"
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700"
          >
            На главную
          </Link>
        </div>
      </div>
    </MessengerShell>
  );
}
