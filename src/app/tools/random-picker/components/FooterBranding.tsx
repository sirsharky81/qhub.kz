"use client";

import { SERVICE_URL } from "@/lib/random-picker";

export function FooterBranding() {
  return (
    <footer className="text-center text-xs text-gray-400 dark:text-gray-500 py-6 space-y-1">
      <p>Сформировано сервисом</p>
      <p className="font-semibold text-gray-600 dark:text-gray-400">Генератор случайных чисел</p>
      <p>
        <a href="https://qhub.kz" className="hover:underline">
          QHub.kz
        </a>
      </p>
      <p>
        <a href={SERVICE_URL} className="hover:underline">
          {SERVICE_URL}
        </a>
      </p>
    </footer>
  );
}
