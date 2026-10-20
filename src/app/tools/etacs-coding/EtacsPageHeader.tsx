"use client";

import Link from "next/link";

export function EtacsSubpageNav({
  onBack,
  action,
}: {
  onBack?: () => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-4 py-2.5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          ← Режимы
        </button>
      ) : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="ml-auto text-xs font-medium text-blue-600 hover:underline"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function EtacsObdLink() {
  return (
    <Link
      href="/tools/obd-diag"
      className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
    >
      OBD Scanner — выгрузка с блока
    </Link>
  );
}
