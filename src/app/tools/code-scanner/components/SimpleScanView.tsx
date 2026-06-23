"use client";

import { useCallback, useState } from "react";
import CameraScanner from "./CameraScanner";
import ScanResultActions from "./ScanResultActions";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import { parseToTable } from "@/lib/code-scanner/parse-content";
import type { SimpleScanEntry } from "@/lib/code-scanner/types";
import { saveSimpleScan } from "@/lib/code-scanner/storage";
import { extractScannableUrl, openScannedUrl } from "@/lib/code-scanner/url-utils";
import { buildReturnRedirect } from "@/lib/code-scanner/scan-return";
import ScannedRawContent from "./ScannedRawContent";

interface Props {
  onBack: () => void;
  returnTo?: string | null;
}

type Phase = "idle" | "scanning" | "result";

export default function SimpleScanView({ onBack, returnTo }: Props) {
  const { t } = useCodeScannerT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<{ raw: string; table: ReturnType<typeof parseToTable> } | null>(null);

  const applyResult = useCallback(
    (raw: string) => {
      if (returnTo) {
        window.location.assign(buildReturnRedirect(returnTo, raw));
        return;
      }
      const url = extractScannableUrl(raw);
      setCurrent({ raw, table: url ? null : parseToTable(raw) });
      setPhase("result");
      if (url) openScannedUrl(url);
    },
    [returnTo],
  );

  async function handleSave() {
    if (!current) return;
    const entry: SimpleScanEntry = {
      id: crypto.randomUUID(),
      raw: current.raw,
      table: current.table
        ? { headers: current.table.headers, rows: current.table.rows, raw: current.raw }
        : null,
      scannedAt: Date.now(),
      mode: "simple",
    };
    await saveSimpleScan(entry);
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs text-gray-500 hover:text-gray-800">
        ← {t("back")}
      </button>

      <p className="text-xs text-gray-500">{t("simpleScanHint")}</p>

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("scanning")}
          className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-gray-900 text-white"
        >
          {t("scan")}
        </button>
      )}

      {phase === "scanning" && (
        <>
          <CameraScanner
            active
            continuous={false}
            settings={{ pauseSeconds: 1, conveyorMode: false }}
            onScan={applyResult}
            onSingleScanDone={() => setPhase("result")}
          />
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="self-start text-xs text-gray-500 hover:text-gray-800"
          >
            {t("cancel")}
          </button>
        </>
      )}

      {phase === "result" && current && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold">{t("rawContent")}</h3>
          <ScannedRawContent raw={current.raw} />
          {current.table && (
            <>
              <h4 className="text-xs font-medium text-gray-600">{t("parsedTable")}</h4>
              <div className="overflow-auto">
                <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      {current.table.headers.map((h) => (
                        <th key={h} className="px-2 py-1 text-left border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {current.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 border-b border-gray-100">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <ScanResultActions raw={current.raw} table={current.table} onSave={handleSave} />
          <div className="pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPhase("scanning")}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-900 text-white"
            >
              {t("scanAgain")}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
