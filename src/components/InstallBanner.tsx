"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "qhub-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  );
}

export default function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ios = isIOS();
    setIsIOSDevice(ios);

    if (ios) {
      const timer = window.setTimeout(() => setVisible(true), 3000);
      return () => window.clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Установить QHub"
      className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-white shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">Установить QHub</p>
          {isIOSDevice ? (
            <p className="mt-1 text-sm text-slate-300">
              Нажмите ↑ Поделиться → На экран «Домой»
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-300">
              Добавьте QHub на главный экран для быстрого доступа к
              инструментам.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-sm text-slate-400 hover:text-slate-200"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {!isIOSDevice && deferredPrompt ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Установить
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
        >
          Позже
        </button>
      </div>
    </div>
  );
}
