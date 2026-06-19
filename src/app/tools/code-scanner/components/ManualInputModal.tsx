"use client";

import { useEffect, useState } from "react";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

export default function ManualInputModal({ open, onClose, onSubmit }: Props) {
  const { t } = useCodeScannerT();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold">{t("manualInput")}</h3>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("manualPlaceholder")}
          rows={4}
          className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200">
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              onSubmit(value.trim());
              onClose();
            }}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40"
          >
            {t("manualSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
