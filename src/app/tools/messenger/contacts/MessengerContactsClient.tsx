"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { messengerChatUrl } from "@/lib/app-routes";
import { useEffect, useState } from "react";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, fetchContacts } from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { maskPhone } from "@/lib/messenger/phone-format";

export function MessengerContactsClient() {
  const router = useRouter();
  const [contacts, setContacts] = useState<
    { phone: string; displayName: string | null; label: string }[]
  >([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void fetchAccessCheck().then((data) => {
      if (!data.messengerLoggedIn) {
        router.replace("/tools/messenger/login");
        return;
      }
      void fetchContacts().then(setContacts);
      void ensureDeviceKeyPublished().catch(() => {});
    });
  }, [router]);

  const filtered = contacts.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.phone.includes(q) ||
      maskPhone(c.phone).includes(q) ||
      (c.displayName?.toLowerCase().includes(q) ?? false)
    );
  });

  function openChat(peerPhone: string) {
    router.push(messengerChatUrl(peerPhone));
  }

  return (
    <MessengerShell variant="app" title="Новый чат" backHref="/tools/messenger/home">
      <div className="p-4 max-w-lg mx-auto w-full space-y-3">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Контакт должен войти в мессенджер хотя бы раз. Если чат не открывается — отправьте ему
          ссылку от администратора.
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени или номеру"
          className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm"
        />
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {filtered.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                onClick={() => openChat(c.phone)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
              >
                <p className="text-sm font-medium">{c.label}</p>
                {c.displayName && (
                  <p className="text-xs text-gray-400">{maskPhone(c.phone)}</p>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-sm text-gray-500 text-center">Контакты не найдены</li>
          )}
        </ul>
      </div>
    </MessengerShell>
  );
}
