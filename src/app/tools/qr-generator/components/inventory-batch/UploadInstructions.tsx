"use client";

import { useRef } from "react";
import { useQrTranslations } from "@/lib/qr-generator/i18n";

interface Props {
  hasBatch: boolean;
  onUploadFile: (file: File) => void;
  onImportQhub: (file: File) => void;
  onDeleteBase: () => void;
  onReloadRequest: () => void;
}

export function UploadInstructions({
  hasBatch,
  onUploadFile,
  onImportQhub,
  onDeleteBase,
  onReloadRequest,
}: Props) {
  const { t } = useQrTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const qhubRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t("batch.uploadTitle")}</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t("batch.uploadHint")}</p>
        <p className="text-xs text-gray-500 mt-2">{t("batch.uploadColumns")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-900 text-white cursor-pointer hover:bg-gray-800">
          {t("batch.uploadFile")}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
        </label>

        <label className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white cursor-pointer hover:bg-gray-50">
          {t("batch.importQhub")}
          <input
            ref={qhubRef}
            type="file"
            accept=".qhub-inventory,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportQhub(f);
              e.target.value = "";
            }}
          />
        </label>

        {hasBatch && (
          <>
            <button
              type="button"
              onClick={onReloadRequest}
              className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
            >
              {t("batch.reloadBase")}
            </button>
            <button
              type="button"
              onClick={onDeleteBase}
              className="px-4 py-2.5 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
            >
              {t("batch.deleteBase")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
