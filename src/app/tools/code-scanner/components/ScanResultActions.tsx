"use client";

import { useState } from "react";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import {
  copyText,
  downloadCsv,
  downloadText,
  downloadXlsxIfAllowed,
  shareText,
  slugFilename,
} from "@/lib/code-scanner/export-utils";
import { tableToMatrix } from "@/lib/code-scanner/parse-content";

interface Props {
  raw: string;
  table: { headers: string[]; rows: string[][] } | null;
  onSave?: () => void;
}

export default function ScanResultActions({ raw, table, onSave }: Props) {
  const { t } = useCodeScannerT();
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const matrix = table ? tableToMatrix(table.headers, table.rows) : null;
  const copyPayload = matrix
    ? matrix.map((row) => row.join("\t")).join("\n")
    : raw;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copyText(copyPayload).then(() => showToast(t("copied")))}
        className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white"
      >
        {t("copy")}
      </button>
      <button
        type="button"
        onClick={() =>
          void shareText(t("title"), copyPayload).then((r) =>
            showToast(r === "shared" ? t("share") : t("copied")),
          )
        }
        className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white"
      >
        {t("share")}
      </button>
      <button
        type="button"
        onClick={() => downloadText(raw, slugFilename("scan", "txt"))}
        className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white"
      >
        {t("txt")}
      </button>
      {matrix && (
        <>
          <button
            type="button"
            onClick={() => downloadCsv(matrix, slugFilename("scan", "csv"))}
            className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white"
          >
            {t("csv")}
          </button>
          <button
            type="button"
            onClick={() => {
              const res = downloadXlsxIfAllowed(matrix, slugFilename("scan", "xlsx"));
              if (!res.ok) showToast(t("xlsxLimit"));
            }}
            className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white"
          >
            {t("xlsx")}
          </button>
        </>
      )}
      {onSave && (
        <button
          type="button"
          onClick={() => {
            onSave();
            showToast(t("save"));
          }}
          className="px-3 py-2 text-xs rounded-lg border border-gray-900 bg-gray-900 text-white"
        >
          {t("save")}
        </button>
      )}
      {toast && <span className="text-xs text-emerald-600 self-center">{toast}</span>}
    </div>
  );
}
