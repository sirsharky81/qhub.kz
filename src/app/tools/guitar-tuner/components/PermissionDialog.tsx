"use client";

import { isIOSDevice } from "@/lib/platform/device";

interface PermissionDialogProps {
  open: boolean;
  denied: boolean;
  pwaHint: boolean;
  error: string | null;
  onRequest: () => void;
}

export default function PermissionDialog({
  open,
  denied,
  pwaHint,
  error,
  onRequest,
}: PermissionDialogProps) {
  if (!open) return null;

  const ios = isIOSDevice();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Доступ к микрофону</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Тюнеру нужен микрофон для определения высоты ноты. Аудио обрабатывается только на вашем
          устройстве и не отправляется на сервер.
        </p>

        {denied && ios && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            <p className="font-medium">Инструкция для iOS:</p>
            <p className="mt-1">
              Настройки → Safari → qhub.kz → Микрофон → Разрешить
            </p>
          </div>
        )}

        {denied && !ios && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            Проверьте разрешения микрофона в настройках браузера для этого сайта.
          </div>
        )}

        {pwaHint && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">
            Если доступ не работает — откройте сайт в Safari напрямую (не с домашнего экрана) один
            раз для выдачи разрешения, затем вернитесь к ярлыку.
          </div>
        )}

        {error && !denied && (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}

        {!denied && (
          <button
            type="button"
            onClick={onRequest}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Разрешить микрофон
          </button>
        )}
      </div>
    </div>
  );
}
