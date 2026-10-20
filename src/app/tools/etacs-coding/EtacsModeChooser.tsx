"use client";

import Link from "next/link";

const cardClass =
  "relative flex w-full min-w-0 items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-all hover:border-gray-300 hover:shadow-sm active:scale-[0.99] touch-manipulation";

export function EtacsModeChooser({
  onFiles,
  onBlock,
}: {
  onFiles: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-8">
      <h2 className="text-base font-semibold text-gray-900">Что вы хотите сделать?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
        Редактор использует справочник на сервере QHub. Запись в автомобиль — через Bluetooth-адаптер vLinker.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-2.5">
        <button type="button" onClick={onFiles} className={cardClass}>
          <span className="text-xl shrink-0" aria-hidden>
            📄
          </span>
          <div className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">Редактор файлов</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                без BLE
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
              Открыть .kon или .cuf, сравнить два файла, изменить опции по справочнику MUT и сохранить на устройство.
            </span>
          </div>
        </button>

        <button type="button" onClick={onBlock} className={cardClass}>
          <span className="text-xl shrink-0" aria-hidden>
            📡
          </span>
          <div className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">Загрузка на блок</span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
                vLinker BLE
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
              Считать кодировку с ETACS, сохранить резерв и записать .kon и .cuf в блок (два шага).
            </span>
          </div>
        </button>
      </div>

      <Link
        href="/tools/obd-diag"
        className="mt-6 block text-center text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
      >
        Выгрузка .kon / .cuf через OBD Scanner
      </Link>
    </div>
  );
}
