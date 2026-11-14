"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModuleDtcReport, ObdBleSession } from "@/lib/obd/obd-session";
import {
  SSM4_FULL_SYSTEMS,
  SSM4_VEHICLES,
  type Ssm4VehicleModel,
} from "@/lib/obd/subaru-ssm4-catalog";
import {
  SUBARU_ALL_DTC_TARGETS,
  classifySubaruDtcStatus,
  decodeSubaruVinInfo,
  isSubaruTxSafeToClear,
} from "@/lib/obd/subaru-ssm4-modules";
import { parseUdsResponse } from "@/lib/obd/uds";
import { SubaruAllFaultsView } from "./subaru/SubaruAllFaultsView";
import { SubaruBlockDetailView } from "./subaru/SubaruBlockDetailView";
import { SubaruBlockListView } from "./subaru/SubaruBlockListView";

interface Props {
  session: ObdBleSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  vinHint?: string | null;
}

type SubaruMainTab = "faults" | "blocks";

function extractAsciiVin(bytes: number[]): string | null {
  const txt = bytes
    .map((b) => (b >= 0x30 && b <= 0x5a ? String.fromCharCode(b) : ""))
    .join("")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
  return txt.length === 17 ? txt : null;
}

export function SubaruSsmPanel({
  session,
  ready,
  busy,
  setBusy,
  setError,
  vinHint,
}: Props) {
  const [mainTab, setMainTab] = useState<SubaruMainTab>("faults");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  const [vin, setVin] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    SSM4_VEHICLES[1]?.id ?? SSM4_VEHICLES[0]!.id,
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // All-system DTC scan state
  const [reportsByTx, setReportsByTx] = useState<Record<string, ModuleDtcReport>>({});
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanDoneCount, setScanDoneCount] = useState(0);
  const stopScanRef = useRef(false);
  const vinAutoTriedRef = useRef(false);
  const manualVehiclePickedRef = useRef(false);

  const vinDecoded = useMemo(() => decodeSubaruVinInfo(vin), [vin]);
  const currentVehicle: Ssm4VehicleModel = useMemo(
    () => SSM4_VEHICLES.find((v) => v.id === selectedVehicleId) ?? SSM4_VEHICLES[0]!,
    [selectedVehicleId],
  );

  const selectedSystem = useMemo(
    () => SSM4_FULL_SYSTEMS.find((s) => s.id === selectedSystemId) ?? null,
    [selectedSystemId],
  );

  useEffect(() => {
    return () => {
      stopScanRef.current = true;
    };
  }, []);

  const readSubaruVin = useCallback(async (): Promise<string | null> => {
    if (vinHint && vinHint.trim().length >= 17) {
      return vinHint.trim().toUpperCase();
    }
    if (!ready) return null;
    try {
      const identity = await session.readVehicleIdentity();
      if (identity.vin && identity.vin.trim().length >= 17) {
        return identity.vin.trim().toUpperCase();
      }
    } catch {
      /* fallback to direct UDS 22 F190 probes */
    }
    for (const [tx, rx] of [
      ["7E0", "7E8"],
      ["783", "78B"],
      ["752", "75A"],
      ["7E1", "7E9"],
    ] as const) {
      try {
        const res = await session.sendUds("6", tx, rx, "22 F1 90", false);
        const parsed = parseUdsResponse(res.raw, 0x22);
        if (parsed.kind === "positive" && parsed.payload.length >= 19) {
          const found = extractAsciiVin(parsed.payload.slice(2));
          if (found) return found;
        }
      } catch {
        /* try next ECU */
      }
    }
    return null;
  }, [ready, session, vinHint]);

  const identifyByVin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const foundVin = await readSubaruVin();
      if (foundVin) {
        setVin(foundVin);
        const info = decodeSubaruVinInfo(foundVin);
        if (info?.vehicle) {
          setSelectedVehicleId(info.vehicle.id);
          setStatusMsg(
            `Определено по VIN ${foundVin}: ${info.vehicle.nameRu}${info.modelYear ? ` · ${info.modelYear} MY` : ""}`,
          );
        } else {
          setStatusMsg(`VIN прочитан: ${foundVin}. Выберите модель вручную при необходимости.`);
        }
      } else if (ready) {
        setStatusMsg("VIN не ответил по OBD/UDS — включите зажигание IG ON или выберите модель вручную.");
      } else {
        setStatusMsg("Подключите адаптер vLinker — VIN и модель определятся автоматически.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка определения VIN");
    } finally {
      setBusy(false);
    }
  }, [readSubaruVin, ready, setBusy, setError]);

  // Auto-detect VIN once when vehicle connection becomes ready
  useEffect(() => {
    if (!ready) {
      vinAutoTriedRef.current = false;
      return;
    }
    if (vinAutoTriedRef.current || manualVehiclePickedRef.current) return;
    vinAutoTriedRef.current = true;
    void identifyByVin();
  }, [ready, identifyByVin]);

  // Sync vinHint from parent ObdDiagClient if OBD tab already read VIN
  useEffect(() => {
    if (vinHint && vinHint.trim().length === 17 && !vin) {
      const clean = vinHint.trim().toUpperCase();
      setVin(clean);
      const info = decodeSubaruVinInfo(clean);
      if (info?.vehicle && !manualVehiclePickedRef.current) {
        setSelectedVehicleId(info.vehicle.id);
      }
    }
  }, [vinHint, vin]);

  const handleScanAll = async () => {
    if (!ready || scanning) return;
    stopScanRef.current = false;
    setScanning(true);
    setBusy(true);
    setError(null);
    setScanDoneCount(0);
    setScanProgress("Запуск опроса всех систем Subaru…");

    try {
      const targets = SUBARU_ALL_DTC_TARGETS.map((t) => ({
        tx: t.tx,
        rx: t.rx,
        title: t.title,
        safetyCritical: t.safetyCritical,
        canSafeClear: t.canSafeClear,
        mode03Fallback: t.mode03Fallback,
        mitsubishiKwp: false,
      }));
      await session.scanAllModuleDtcs(
        "6",
        (msg, partial) => {
          setScanProgress(msg);
          setScanDoneCount(partial.length);
          const nextMap: Record<string, ModuleDtcReport> = {};
          for (const rep of partial) {
            nextMap[rep.txHex.toUpperCase()] = rep;
          }
          setReportsByTx((prev) => ({ ...prev, ...nextMap }));
        },
        () => stopScanRef.current,
        targets,
        "subaru",
      );
      setScanProgress(
        stopScanRef.current ? "Сканирование остановлено пользователем." : "Сканирование всех блоков завершено.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сканирования всех блоков");
    } finally {
      setScanning(false);
      setBusy(false);
    }
  };

  const handleStopScan = () => {
    stopScanRef.current = true;
  };

  const handleScanSingle = async (txHex: string, rxHex: string, title: string) => {
    if (!ready || scanning) return;
    setBusy(true);
    setError(null);
    try {
      const txNum = Number.parseInt(txHex, 16);
      const rxNum = Number.parseInt(rxHex, 16);
      const matchedTarget = SUBARU_ALL_DTC_TARGETS.find((t) => t.tx === txNum);
      const reports = await session.scanAllModuleDtcs(
        "6",
        undefined,
        undefined,
        [
          {
            tx: txNum,
            rx: rxNum,
            title,
            safetyCritical: matchedTarget?.safetyCritical ?? !isSubaruTxSafeToClear(txHex),
            canSafeClear: matchedTarget?.canSafeClear ?? isSubaruTxSafeToClear(txHex),
            mode03Fallback: txNum === 0x7e0 || txNum === 0x7e1,
            mitsubishiKwp: false,
          },
        ],
        "subaru",
      );
      if (reports[0]) {
        setReportsByTx((prev) => ({
          ...prev,
          [reports[0]!.txHex.toUpperCase()]: reports[0]!,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Ошибка опроса блока «${title}»`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearSingle = async (txHex: string, rxHex: string, title: string) => {
    if (!ready || scanning) return;
    setBusy(true);
    setError(null);
    try {
      await session.clearModuleDtcsSafe("6", txHex, rxHex);
      setStatusMsg(`Ошибки блока «${title}» успешно очищены.`);
      // Re-scan single module immediately after clear
      const txNum = Number.parseInt(txHex, 16);
      const rxNum = Number.parseInt(rxHex, 16);
      const reports = await session.scanAllModuleDtcs(
        "6",
        undefined,
        undefined,
        [
          {
            tx: txNum,
            rx: rxNum,
            title,
            safetyCritical: false,
            canSafeClear: true,
            mode03Fallback: txNum === 0x7e0 || txNum === 0x7e1,
            mitsubishiKwp: false,
          },
        ],
        "subaru",
      );
      if (reports[0]) {
        setReportsByTx((prev) => ({
          ...prev,
          [reports[0]!.txHex.toUpperCase()]: reports[0]!,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Ошибка очистки DTC в блоке «${title}»`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAllSafe = async () => {
    if (!ready || scanning) return;
    const faultedSafe = SUBARU_ALL_DTC_TARGETS.filter((t) => {
      const txHex = t.tx.toString(16).toUpperCase();
      const rep = reportsByTx[txHex];
      return isSubaruTxSafeToClear(txHex) && rep && rep.dtcs.length > 0;
    });
    if (faultedSafe.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      let cleared = 0;
      for (const target of faultedSafe) {
        const txHex = target.tx.toString(16).toUpperCase();
        const rxHex = target.rx.toString(16).toUpperCase();
        try {
          await session.clearModuleDtcsSafe("6", txHex, rxHex);
          cleared++;
        } catch {
          /* continue remaining safe modules */
        }
      }
      setStatusMsg(`Очищены ошибки в ${cleared} из ${faultedSafe.length} безопасных блоков. Повторная проверка…`);
      const refreshed = await session.scanAllModuleDtcs(
        "6",
        undefined,
        undefined,
        faultedSafe.map((t) => ({
          tx: t.tx,
          rx: t.rx,
          title: t.title,
          safetyCritical: t.safetyCritical,
          canSafeClear: t.canSafeClear,
          mode03Fallback: t.mode03Fallback,
          mitsubishiKwp: false,
        })),
        "subaru",
      );
      setReportsByTx((prev) => {
        const next = { ...prev };
        for (const r of refreshed) next[r.txHex.toUpperCase()] = r;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка массовой очистки DTC");
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ["VIN", "Model", "Module", "Status", "Code", "Severity", "Description", "PartNumber"],
    ];
    for (const target of SUBARU_ALL_DTC_TARGETS) {
      const txHex = target.tx.toString(16).toUpperCase();
      const rep = reportsByTx[txHex];
      if (!rep) continue;
      if (!rep.responded) {
        rows.push([vin ?? "", currentVehicle.nameRu, target.nameEn, "Not Detected", "", "", "", ""]);
      } else if (rep.dtcs.length === 0) {
        rows.push([
          vin ?? "",
          currentVehicle.nameRu,
          target.nameEn,
          "No DTC",
          "",
          "",
          "",
          rep.partNumber ?? "",
        ]);
      } else {
        for (const d of rep.dtcs) {
          rows.push([
            vin ?? "",
            currentVehicle.nameRu,
            target.nameEn,
            "Fault",
            d.code,
            classifySubaruDtcStatus(d) === "current" ? "Current" : "History",
            d.description,
            rep.partNumber ?? "",
          ]);
        }
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `subaru-dtc-report-${vin || "scan"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openBlockFromFaults = (systemId: string) => {
    setSelectedSystemId(systemId);
    setMainTab("blocks");
  };

  return (
    <div className="space-y-3">
      {/* Vehicle Header: VIN Auto-Detect + Model Selector (like SSM4 + Mitsubishi Diagnostics) */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-gray-500">
            <span>Модель Subaru (SSM4)</span>
            <select
              value={selectedVehicleId}
              onChange={(e) => {
                manualVehiclePickedRef.current = true;
                setSelectedVehicleId(e.target.value);
              }}
              className="w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs font-semibold text-gray-900"
            >
              {SSM4_VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nameRu} ({v.years})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || scanning}
            onClick={() => {
              manualVehiclePickedRef.current = false;
              void identifyByVin();
            }}
            className="shrink-0 rounded-lg border border-gray-900 bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Определить по VIN
          </button>
        </div>

        {/* Decoded Vehicle Strip */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {vin ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono font-bold text-emerald-900">
              VIN: {vin}
            </span>
          ) : (
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-500">
              VIN: не прочитан
            </span>
          )}
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-800">
            {currentVehicle.division} · {currentVehicle.modelCode}
          </span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
            Платформа: {currentVehicle.platform}
          </span>
          {vinDecoded?.modelYear && (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
              {vinDecoded.modelYear} MY
            </span>
          )}
          {vinDecoded && vinDecoded.plantCountry !== "Неизвестно" && (
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-600">
              {vinDecoded.plantCountry}
            </span>
          )}
        </div>

        {statusMsg && <p className="text-xs text-emerald-800">{statusMsg}</p>}
        {!ready && (
          <p className="text-[11px] text-gray-500">
            Подключите адаптер vLinker и включите зажигание IG ON — VIN определится автоматически. Все блоки и функции можно просматривать и без подключения.
          </p>
        )}
      </div>

      {/* Main 2-Tab Navigation: Все ошибки | Блоки */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setMainTab("faults")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
            mainTab === "faults"
              ? "bg-gray-900 text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Все ошибки (All Systems)
        </button>
        <button
          type="button"
          onClick={() => setMainTab("blocks")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
            mainTab === "blocks"
              ? "bg-gray-900 text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Блоки (Target Each System)
          {selectedSystem ? ` · ${selectedSystem.abbr}` : ""}
        </button>
      </div>

      {/* View 1: All Systems Fault Scan */}
      {mainTab === "faults" && (
        <SubaruAllFaultsView
          ready={ready}
          busy={busy}
          scanning={scanning}
          scanProgress={scanProgress}
          scanDoneCount={scanDoneCount}
          reportsByTx={reportsByTx}
          onScanAll={() => void handleScanAll()}
          onStopScan={handleStopScan}
          onScanSingle={(tx, rx, title) => void handleScanSingle(tx, rx, title)}
          onClearSingle={(tx, rx, title) => void handleClearSingle(tx, rx, title)}
          onClearAllSafe={() => void handleClearAllSafe()}
          onOpenBlock={openBlockFromFaults}
          onExportCsv={handleExportCsv}
        />
      )}

      {/* View 2: Target Each System (Level 1 -> Level 2 -> Level 3) */}
      {mainTab === "blocks" && (
        selectedSystem ? (
          <SubaruBlockDetailView
            system={selectedSystem}
            session={session}
            ready={ready}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            report={reportsByTx[selectedSystem.txHex.toUpperCase()]}
            onScanSingle={(tx, rx, title) => void handleScanSingle(tx, rx, title)}
            onClearSingle={(tx, rx, title) => void handleClearSingle(tx, rx, title)}
            onBackToList={() => setSelectedSystemId(null)}
          />
        ) : (
          <SubaruBlockListView
            reportsByTx={reportsByTx}
            onSelectBlock={(id) => setSelectedSystemId(id)}
          />
        )
      )}
    </div>
  );
}
