"use client";

import { useEffect, useState } from "react";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";
import {
  type BeforeInstallPromptEvent,
  isIOS,
  isStandalone,
} from "@/lib/pwa-utils";

const ICON_BASE = `/${ADMIN_PANEL_PATH}`;

interface Props {
  open: boolean;
  onContinue: () => void;
}

export function AdminInstallModal({ open, onContinue }: Props) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const ios = isIOS();

  useEffect(() => {
    if (!open || isStandalone()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [open]);

  if (!open || isStandalone()) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    onContinue();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-install-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ICON_BASE}/icon-192.png`}
            alt=""
            className="h-14 w-14 rounded-2xl"
          />
          <div>
            <h2 id="admin-install-title" className="text-base font-semibold text-gray-900">
              Добавьте панель на главный экран
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Ярлык откроет вход в панель напрямую</p>
          </div>
        </div>

        {ios ? (
          <p className="text-sm text-gray-600 leading-relaxed">
            Нажмите <span className="font-medium">Поделиться</span> (↑ внизу Safari) →{" "}
            <span className="font-medium">На экран «Домой»</span>. Удалите старый ярлык QHub, если
            ставили его с главной страницы — нужен ярлык с этой страницы входа.
          </p>
        ) : deferredPrompt ? (
          <p className="text-sm text-gray-600 leading-relaxed">
            Установите приложение — ярлык будет открывать панель управления, а не главную QHub.
          </p>
        ) : (
          <p className="text-sm text-gray-600 leading-relaxed">
            Меню браузера (⋮) → <span className="font-medium">Установить приложение</span> или{" "}
            <span className="font-medium">Добавить на главный экран</span>.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {!ios && deferredPrompt ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold hover:bg-gray-800"
            >
              Установить
            </button>
          ) : null}
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
