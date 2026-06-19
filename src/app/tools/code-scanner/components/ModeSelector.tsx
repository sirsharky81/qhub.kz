"use client";

import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import type { ScanMode } from "@/lib/code-scanner/types";

interface Props {
  onSelect: (mode: ScanMode) => void;
}

export default function ModeSelector({ onSelect }: Props) {
  const { t } = useCodeScannerT();

  const modes: { id: ScanMode; title: string; desc: string }[] = [
    { id: "simple", title: t("modeSimple"), desc: t("modeSimpleDesc") },
    { id: "storage", title: t("modeStorage"), desc: t("modeStorageDesc") },
    { id: "inventory", title: t("modeInventory"), desc: t("modeInventoryDesc") },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onSelect(mode.id)}
          className="text-left rounded-2xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all active:scale-[0.99]"
        >
          <h2 className="text-sm font-semibold text-gray-900">{mode.title}</h2>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">{mode.desc}</p>
        </button>
      ))}
    </div>
  );
}
