"use client";

import { useCallback, useState } from "react";
import CameraScanner from "./CameraScanner";
import ManualInputModal from "./ManualInputModal";
import ScanResultActions from "./ScanResultActions";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import { parseToTable } from "@/lib/code-scanner/parse-content";
import type { SimpleScanEntry } from "@/lib/code-scanner/types";
import { saveSimpleScan } from "@/lib/code-scanner/storage";

interface Props {
  onBack: () => void;
}

type Phase = "idle" | "scanning" | "result";

export default function SimpleScanView({ onBack }: Props) {
  const { t } = useCodeScannerT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [manualOpen, setManualOpen] = useState(false);
  const [current, setCurrent] = useState<{ raw: string; table: ReturnType<typeof parseToTable> } | null>(null);

  const applyResult = useCallback((raw: string) => {
    setCurrent({ raw, table: parseToTable(raw) });
    setPhase("result");
  }, []);

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
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => setPhase("scanning")}
            className="flex-1 px-4 py-3 text-sm font-medium rounded-xl bg-gray-900 text-white"
          >
            {t("scan")}
          </button>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="flex-1 px-4 py-3 text-sm font-medium rounded-xl border border-gray-200 bg-white"
          >
            {t("manualInput")}
          </button>
        </div>
      )}

      {phase === "scanning" && (
        <>
          <CameraScanner
            active
            continuous={false}
            settings={{ pauseSeconds: 1, conveyorMode: false }}
            onScan={applyResult}
            onSingleScanDone={() => setPhase("result")}
            onManualInput={() => {
              setPhase("idle");
              setManualOpen(true);
            }}
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
          <pre className="text-xs whitespace-pre-wrap break-all bg-gray-50 rounded-lg p-3 max-h-40 overflow-auto">
            {current.raw}
          </pre>
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
          <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPhase("scanning")}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-900 text-white"
            >
              {t("scanAgain")}
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200"
            >
              {t("manualInput")}
            </button>
          </div>
        </div>
      )}

      <ManualInputModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(raw) => {
          applyResult(raw);
          setManualOpen(false);
        }}
      />
    </div>
  );
}
