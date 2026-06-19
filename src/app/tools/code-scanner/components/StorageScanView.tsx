"use client";

import { useCallback, useState } from "react";
import CameraScanner, { CameraToggle, ScanSessionControls } from "./CameraScanner";
import ManualInputModal from "./ManualInputModal";
import ScanResultActions from "./ScanResultActions";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import { parseStorageContent, storageDisplayLabel } from "@/lib/code-scanner/parse-storage";
import { parseToTable } from "@/lib/code-scanner/parse-content";
import type { ScanSessionSettings, StorageScanEntry } from "@/lib/code-scanner/types";
import { DEFAULT_SCAN_SETTINGS } from "@/lib/code-scanner/types";
import { saveStorageSessionEntry } from "@/lib/code-scanner/storage";
import { downloadCsv, downloadText, slugFilename } from "@/lib/code-scanner/export-utils";

interface Props {
  onBack: () => void;
}

export default function StorageScanView({ onBack }: Props) {
  const { t } = useCodeScannerT();
  const [settings, setSettings] = useState<ScanSessionSettings>(DEFAULT_SCAN_SETTINGS);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [session, setSession] = useState<StorageScanEntry[]>([]);
  const [selected, setSelected] = useState<StorageScanEntry | null>(null);

  const handleScan = useCallback((raw: string) => {
    const data = parseStorageContent(raw);
    const entry: StorageScanEntry = {
      id: crypto.randomUUID(),
      scannedAt: Date.now(),
      data,
      raw,
    };
    setSession((prev) => [entry, ...prev]);
    setSelected(entry);
    void saveStorageSessionEntry(entry);
  }, []);

  function exportSession() {
    const lines = session.map((e) =>
      storageDisplayLabel(
        e.data ?? {
          type: "storage",
          boxNumber: e.raw.slice(0, 40),
          name: "",
          location: [],
          items: [],
          comment: "",
          raw: e.raw,
        },
      ),
    );
    downloadText(lines.join("\n"), slugFilename("storage-session", "txt"));
  }

  function exportSessionCsv() {
    downloadCsv(
      [
        ["Метка", "Время", "Номер", "Название"],
        ...session.map((e) => [
          storageDisplayLabel(
            e.data ?? {
              type: "storage",
              boxNumber: "",
              name: e.raw.slice(0, 40),
              location: [],
              items: [],
              comment: "",
              raw: e.raw,
            },
          ),
          new Date(e.scannedAt).toLocaleString("ru-RU"),
          e.data?.boxNumber ?? "",
          e.data?.name ?? "",
        ]),
      ],
      slugFilename("storage-session", "csv"),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs text-gray-500 hover:text-gray-800">
        ← {t("back")}
      </button>

      <CameraToggle enabled={cameraEnabled} onChange={setCameraEnabled} />

      {cameraEnabled && (
        <ScanSessionControls settings={settings} onChange={setSettings} />
      )}

      <button
        type="button"
        onClick={() => setManualOpen(true)}
        className="w-full sm:w-auto px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white"
      >
        {t("manualInput")}
      </button>

      {cameraEnabled && (
        <CameraScanner
          active
          continuous
          settings={settings}
          onScan={handleScan}
          onManualInput={() => setManualOpen(true)}
        />
      )}

      {!cameraEnabled && (
        <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          {t("manualOnlyHint")}
        </p>
      )}

      {session.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("storageHistory")}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={exportSession} className="text-xs px-2 py-1 border rounded-lg">
                TXT
              </button>
              <button type="button" onClick={exportSessionCsv} className="text-xs px-2 py-1 border rounded-lg">
                CSV
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {session.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e)}
                className={`px-2.5 py-1 rounded-full text-xs border ${selected?.id === e.id ? "border-sky-500 bg-sky-50" : "border-gray-200"}`}
              >
                {e.data ? storageDisplayLabel(e.data) : e.raw.slice(0, 20)}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          {selected.data ? (
            <dl className="grid gap-2 text-sm">
              {selected.data.boxNumber && (
                <>
                  <dt className="text-gray-500 text-xs">{t("boxNumber")}</dt>
                  <dd>{selected.data.boxNumber}</dd>
                </>
              )}
              {selected.data.name && (
                <>
                  <dt className="text-gray-500 text-xs">{t("boxName")}</dt>
                  <dd>{selected.data.name}</dd>
                </>
              )}
              {selected.data.location.length > 0 && (
                <>
                  <dt className="text-gray-500 text-xs">{t("boxLocation")}</dt>
                  <dd>{selected.data.location.join(" → ")}</dd>
                </>
              )}
              {selected.data.items.length > 0 && (
                <>
                  <dt className="text-gray-500 text-xs">{t("boxItems")}</dt>
                  <dd>
                    <ul className="list-disc pl-4">
                      {selected.data.items.map((item, i) => (
                        <li key={i}>
                          {item.name} ×{item.quantity}
                          {item.comment ? ` (${item.comment})` : ""}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              {selected.data.comment && (
                <>
                  <dt className="text-gray-500 text-xs">{t("boxComment")}</dt>
                  <dd className="whitespace-pre-wrap">{selected.data.comment}</dd>
                </>
              )}
            </dl>
          ) : (
            <>
              <p className="text-xs text-amber-700">{t("storageFallback")}</p>
              <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{selected.raw}</pre>
            </>
          )}
          <ScanResultActions raw={selected.raw} table={parseToTable(selected.raw)} />
        </div>
      )}

      <ManualInputModal open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleScan} />
    </div>
  );
}
