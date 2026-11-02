"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveMetricCards } from "./LiveMetricCards";
import type { CatalogEcu, CatalogSignal, CatalogVehicle, CatalogVehicleSummary } from "@/lib/etacs-coding/diag-catalog";
import { asciiFromKwpPayload, decodeCatalogSignal } from "@/lib/obd/mut-live";
import {
  buildMitsubishiVisitReport,
  ecuMatchesServiceSet,
  isTransmissionEcu,
  mitsubishiFluidBand,
  parseMitsubishiModuleIdentity,
  pickPreferredMonitorSignals,
  pickServiceSetSignals,
  type MitsubishiServiceSet,
} from "@/lib/obd/mitsubishi-mut-monitor";
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import {
  ObdBleSession,
  type ModuleDtcReport,
  type ModuleDtcTarget,
  type ObdConnectionPhase,
} from "@/lib/obd/obd-session";
import type { MitsubishiMeterReport, MitsubishiTcmTelemetry, TpmsModuleReport } from "@/lib/obd/mitsubishi-modules";

interface Props {
  session: ObdBleSession;
  phase: ObdConnectionPhase;
}

interface Sample {
  t: number;
  values: Record<string, number | null>;
}

interface DtcText {
  en: string;
  ru: string;
}

const MAX_LIVE = 16;
const MAX_POINTS = 48;

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function addressKey(tx: string, rx: string): string {
  return `${tx.toUpperCase()}-${rx.toUpperCase()}`;
}

async function readDiagVin(session: ObdBleSession): Promise<string | null> {
  try {
    const identity = await session.readVehicleIdentity();
    if (identity.vin && identity.vin.length >= 11) return identity.vin;
  } catch {
    /* Mitsubishi often has no Mode 09 VIN */
  }
  for (const [tx, rx] of [
    ["7E0", "7E8"],
    ["620", "504"],
  ]) {
    try {
      const { parsed } = await session.sendUds("6", tx, rx, "21 90", false);
      if (parsed.kind !== "positive") continue;
      const vin = asciiFromKwpPayload(parsed.payload);
      if (vin) return vin;
    } catch {
      /* try the next module */
    }
  }
  return null;
}

export default function MutDiagPanel({ session, phase }: Props) {
  const [vehicles, setVehicles] = useState<CatalogVehicleSummary[]>([]);
  const [vehicle, setVehicle] = useState<CatalogVehicle | null>(null);
  const [vin, setVin] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<Record<string, ModuleDtcReport>>({});
  const [texts, setTexts] = useState<Record<string, Record<string, DtcText>>>({});
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [signals, setSignals] = useState<CatalogSignal[]>([]);
  const [signalQuery, setSignalQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [liveNow, setLiveNow] = useState<Record<string, string>>({});
  const stopScan = useRef(false);
  const stopLive = useRef(false);
  const liveRunning = useRef(false);
  const liveMinMaxRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  const [liveMinMaxTick, setLiveMinMaxTick] = useState(0);
  const [tcm, setTcm] = useState<MitsubishiTcmTelemetry | null>(null);
  const [tpms, setTpms] = useState<TpmsModuleReport | null>(null);
  const [meter, setMeter] = useState<MitsubishiMeterReport | null>(null);
  const tcmLiveRef = useRef(false);
  const [tcmLive, setTcmLive] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopScan.current = true;
      stopLive.current = true;
      tcmLiveRef.current = false;
    };
  }, []);

  const selected = vehicle?.ecus.find((ecu) => ecu.sysKey === selectedKey) ?? null;
  const pickedSignals = useMemo(
    () => signals.filter((signal) => picked.includes(signal.id)),
    [signals, picked],
  );

  const visibleSignals = useMemo(() => {
    const query = signalQuery.trim().toLowerCase();
    const matched = signals.filter((signal) => {
      if (picked.includes(signal.id)) return true;
      if (!query) return true;
      return `${signal.nameRu} ${signal.nameEn}`.toLowerCase().includes(query);
    });
    return matched.slice(0, query ? 40 : 24);
  }, [signals, signalQuery, picked]);

  const loadVehicle = async (query: string) => {
    const response = await fetch(`/api/etacs-coding/diag?${query}`);
    const body = (await response.json()) as {
      error?: string;
      vehicles?: CatalogVehicleSummary[];
      vehicle?: CatalogVehicle | null;
    };
    if (!response.ok) throw new Error(body.error || "Каталог недоступен");
    setVehicles(body.vehicles ?? []);
    setVehicle(body.vehicle ?? null);
    setReports({});
    setTexts({});
    setSelectedKey(null);
    setSignals([]);
    setPicked([]);
    return body.vehicle ?? null;
  };

  const identify = async () => {
    setBusy(true);
    setError(null);
    try {
      let found: string | null = null;
      if (phase === "vehicle") found = await readDiagVin(session);
      setVin(found);
      const matched = await loadVehicle(found ? `vin=${encodeURIComponent(found)}` : "");
      setStatus(
        matched
          ? matched.nameRu
          : found
            ? "VIN не совпал с каталогом. Выберите машину."
            : "Выберите машину из каталога.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setBusy(false);
    }
  };

  const chooseVehicle = async (vkey: string) => {
    setBusy(true);
    setError(null);
    try {
      const matched = await loadVehicle(`vkey=${encodeURIComponent(vkey)}`);
      setStatus(matched?.nameRu ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    if (!vehicle) return;
    stopLive.current = true;
    setLive(false);
    stopScan.current = false;
    setBusy(true);
    setError(null);
    const unique = new Map<string, CatalogEcu>();
    for (const ecu of vehicle.ecus) {
      const key = addressKey(ecu.txCanId, ecu.rxCanId);
      if (!unique.has(key)) unique.set(key, ecu);
    }
    const targets: ModuleDtcTarget[] = [...unique.values()].map((ecu) => ({
      tx: Number.parseInt(ecu.txCanId, 16),
      rx: Number.parseInt(ecu.rxCanId, 16),
      title: ecu.nameRu || ecu.nameEn,
      safetyCritical: !ecu.canSafeClear,
      canSafeClear: ecu.canSafeClear,
      mode03Fallback: ecu.txCanId === "7E0" || ecu.txCanId === "7E1",
    }));
    try {
      const found = await session.scanCatalogModules(
        "6",
        targets,
        (line, partial) => {
          setStatus(line);
          setReports((prev) => {
            const next = { ...prev };
            for (const report of partial) next[addressKey(report.txHex, report.rxHex)] = report;
            return next;
          });
        },
        () => stopScan.current,
      );
      const nextReports: Record<string, ModuleDtcReport> = {};
      for (const report of found) nextReports[addressKey(report.txHex, report.rxHex)] = report;
      setReports(nextReports);
      await describe(vehicle.ecus, nextReports);
      setStatus(`Опрошено блоков: ${found.length}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Опрос блоков не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const describe = async (ecus: CatalogEcu[], nextReports: Record<string, ModuleDtcReport>) => {
    const byMaster = new Map<string, Set<string>>();
    for (const ecu of ecus) {
      const report = nextReports[addressKey(ecu.txCanId, ecu.rxCanId)];
      if (!report || report.dtcs.length === 0) continue;
      const bucket = byMaster.get(ecu.dtcMasterId) ?? new Set<string>();
      for (const dtc of report.dtcs) bucket.add(dtc.code);
      byMaster.set(ecu.dtcMasterId, bucket);
    }
    const next: Record<string, Record<string, DtcText>> = {};
    for (const [dtcMasterId, codes] of byMaster) {
      const response = await fetch("/api/etacs-coding/diag/dtc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dtcMasterId, codes: [...codes].slice(0, 80) }),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { descriptions?: Record<string, DtcText> };
      next[dtcMasterId] = body.descriptions ?? {};
    }
    setTexts(next);
  };

  const clearEcu = async (ecu: CatalogEcu) => {
    if (!ecu.canSafeClear) return;
    const confirmed = window.confirm(`Сбросить ошибки блока «${ecu.nameRu}»?`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const message = await session.clearModuleDtcsSafe("6", ecu.txCanId, ecu.rxCanId);
      setStatus(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сброс не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const readModuleIdentity = async (tx: string, rx: string) => {
    const readOnce = async () => {
      let partNumber: string | null = null;
      let diagVersion: string | null = null;
      for (const request of ["1A 9C", "1A 87", "21 87"]) {
        try {
          const { parsed } = await session.sendUds("6", tx, rx, request, false);
          if (parsed.kind !== "positive") continue;
          const identity = parseMitsubishiModuleIdentity(request, parsed.payload);
          partNumber = partNumber ?? identity.partNumber;
          diagVersion = diagVersion ?? identity.diagVersion;
        } catch {
          /* the next identification request */
        }
      }
      return { partNumber, diagVersion };
    };
    let identity = await readOnce();
    if (!identity.partNumber && !identity.diagVersion) {
      try {
        await session.sendUds("6", tx, rx, "10 92", false);
      } catch {
        /* identification still falls back to the catalog profile */
      }
      identity = await readOnce();
    }
    return identity;
  };

  const openEcu = async (ecu: CatalogEcu, serviceSet?: MitsubishiServiceSet) => {
    stopLive.current = true;
    setLive(false);
    setSelectedKey(ecu.sysKey);
    setSignalQuery("");
    setPicked([]);
    setSamples([]);
    setLiveNow({});
    setSignals([]);
    setProfileNote(null);
    if (!vehicle) return;
    try {
      let diagVersion: string | null = null;
      let partNumber: string | null = null;
      if (phase === "vehicle") {
        setStatus("Читаю парт-номер и версию блока…");
        const identity = await readModuleIdentity(ecu.txCanId, ecu.rxCanId);
        diagVersion = identity.diagVersion;
        partNumber = identity.partNumber;
      }
      const query = new URLSearchParams({
        vkey: vehicle.vkey,
        sysKey: String(ecu.sysKey),
      });
      if (diagVersion) query.set("diagVersion", diagVersion);
      if (partNumber) query.set("partNumber", partNumber);
      const response = await fetch(`/api/etacs-coding/diag/signals?${query.toString()}`);
      const body = (await response.json()) as {
        error?: string;
        signals?: CatalogSignal[];
        profileNoteRu?: string;
      };
      if (!response.ok) throw new Error(body.error || "Список параметров недоступен");
      const list = body.signals ?? [];
      setSignals(list);
      setProfileNote(body.profileNoteRu ?? null);
      const serviceIds = serviceSet ? pickServiceSetSignals(list, serviceSet, MAX_LIVE) : [];
      setPicked(serviceIds.length > 0 ? serviceIds : pickPreferredMonitorSignals(list, MAX_LIVE));
      setStatus(null);
      requestAnimationFrame(() => {
        document.getElementById("mitsu-live-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Список параметров недоступен");
    }
  };

  const readTcmOnce = async () => {
    if (phase !== "vehicle" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setTcm(await session.readMitsubishiTransmission());
    } catch (cause) {
      setTcm(null);
      setError(cause instanceof Error ? cause.message : "Нет ответа TCM 7E1");
    } finally {
      setBusy(false);
    }
  };

  const toggleTcmLive = async () => {
    if (tcmLiveRef.current) {
      tcmLiveRef.current = false;
      setTcmLive(false);
      return;
    }
    if (phase !== "vehicle" || busy) return;
    tcmLiveRef.current = true;
    setTcmLive(true);
    setError(null);
    try {
      while (tcmLiveRef.current) {
        setTcm(await session.readMitsubishiTransmission());
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сбой live АКПП/CVT");
    } finally {
      tcmLiveRef.current = false;
      setTcmLive(false);
    }
  };

  const readTpmsOnce = async () => {
    if (phase !== "vehicle" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setTpms(await session.readTpmsSensors("mitsubishi-auto"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Нет ответа TPMS");
    } finally {
      setBusy(false);
    }
  };

  const readMeterOnce = async () => {
    if (phase !== "vehicle" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setMeter(await session.readMitsubishiMeter());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Нет ответа приборки 6A0");
    } finally {
      setBusy(false);
    }
  };

  const toggleSignal = (id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_LIVE) return current;
      return [...current, id];
    });
  };

  const startLive = async () => {
    if (!selected || pickedSignals.length === 0 || liveRunning.current) return;
    liveRunning.current = true;
    stopLive.current = false;
    setLive(true);
    setError(null);
    liveMinMaxRef.current.clear();
    const tx = selected.txCanId;
    const rx = selected.rxCanId;
    try {
      try {
        await session.sendUds("6", tx, rx, "10 92", false);
      } catch {
        try {
          await session.sendUds("6", tx, rx, "10 03", false);
        } catch {
          /* some modules answer data requests without an explicit session */
        }
      }
      while (!stopLive.current) {
      const now: Record<string, string> = {};
      const numeric: Record<string, number | null> = {};
      const groups = new Map<string, CatalogSignal[]>();
      for (const signal of pickedSignals) {
        const key = `${signal.service.toString(16)}-${signal.localId.toString(16)}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(signal);
        groups.set(key, bucket);
      }
      for (const group of groups.values()) {
        if (stopLive.current) break;
        const first = group[0]!;
        const request =
          first.service === 0x22
            ? `22 ${first.localId.toString(16).padStart(4, "0")}`
            : `21 ${first.localId.toString(16).padStart(2, "0")}`;
        try {
          const { parsed } = await session.sendUds("6", tx, rx, request, false);
          for (const signal of group) {
            const decoded = parsed.kind === "positive" ? decodeCatalogSignal(signal, parsed.payload) : null;
            now[signal.id] = decoded?.text ?? "—";
            numeric[signal.id] = decoded?.numeric ?? null;
          }
        } catch {
          for (const signal of group) {
            now[signal.id] = "—";
            numeric[signal.id] = null;
          }
        }
      }
      if (stopLive.current) break;
      for (const signal of pickedSignals) {
        const n = numeric[signal.id];
        if (n == null || Number.isNaN(n)) continue;
        const prev = liveMinMaxRef.current.get(signal.id);
        liveMinMaxRef.current.set(signal.id, {
          min: prev ? Math.min(prev.min, n) : n,
          max: prev ? Math.max(prev.max, n) : n,
        });
      }
      setLiveMinMaxTick((t) => t + 1);
      setLiveNow(now);
      setSamples((prev) => [...prev, { t: Date.now(), values: numeric }].slice(-MAX_POINTS));
      await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } finally {
      liveRunning.current = false;
      setLive(false);
    }
  };

  const downloadCsv = () => {
    const columns = pickedSignals;
    const header = ["time", ...columns.map((signal) => signal.nameRu || signal.nameEn)].map(csvCell);
    const lines = [header.join(",")];
    for (const sample of samples) {
      const cells = [
        new Date(sample.t).toISOString(),
        ...columns.map((signal) => {
          const value = sample.values[signal.id];
          return value == null ? "" : String(value);
        }),
      ].map(csvCell);
      lines.push(cells.join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mut-live-${selected?.nameEn || "ecu"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadVisit = () => {
    const pressures = pickedSignals
      .filter((signal) => /pressure|давлени/i.test(`${signal.nameEn} ${signal.nameRu}`))
      .map((signal) => ({
        label: signal.nameRu || signal.nameEn,
        value: liveNow[signal.id] ?? "",
      }));
    const csv = buildMitsubishiVisitReport({
      vin,
      vehicleName: vehicle ? vehicle.nameRu : null,
      modules: (vehicle?.ecus ?? []).map((ecu) => {
        const report = reports[addressKey(ecu.txCanId, ecu.rxCanId)];
        const master = texts[ecu.dtcMasterId] ?? {};
        return {
          nameRu: ecu.nameRu,
          address: `${ecu.txCanId}→${ecu.rxCanId}`,
          responded: report ? report.responded : null,
          partNumber: report?.partNumber ?? null,
          dtcs: (report?.dtcs ?? []).map((dtc) => ({
            code: dtc.code,
            textRu: master[dtc.code]?.ru || dtc.description,
            remedy: dtc.remedy ?? remedyForDtcCode(dtc.code),
            active: dtc.active,
          })),
        };
      }),
      transmission: tcm
        ? {
            kind: tcm.transmissionType,
            tempC: tcm.atfTempC,
            pipeC: tcm.atfTempPipeC,
            panC: tcm.atfTempPanC,
            formula: tcm.atfFormula === "a-55" ? "CVT A-55" : "8AT/5AT A-50",
            bandRu: tcm.atfTempC != null ? mitsubishiFluidBand(tcm.atfTempC, tcm.transmissionType).labelRu : null,
            selector: tcm.selectorPosition,
            gear: tcm.currentGearText,
            inputRpm: tcm.inputShaftRpm,
            outputRpm: tcm.outputShaftRpm,
            degradation: tcm.cvtDegradationCount,
          }
        : null,
      pressures,
      tpms: (tpms?.wheels ?? []).map((wheel) => ({
        label: wheel.defaultLabel,
        bar: wheel.pressureBar,
        tempC: wheel.temperatureC,
      })),
      meter: meter ? { fuelLiters: meter.fuelLiters, odometerKm: meter.odometerKm } : null,
      live: pickedSignals.map((signal) => ({
        name: signal.nameRu || signal.nameEn,
        value: liveNow[signal.id] ?? "",
        unit: signal.unit,
      })),
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qhub-visit-${vin || vehicle?.vkey || "mitsubishi"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const serviceButtons: Array<{ set: MitsubishiServiceSet; label: string }> = [
    { set: "engine", label: "Двигатель" },
    { set: "gearbox", label: "Коробка" },
    { set: "4wd", label: "4WD" },
    { set: "body", label: "Кузов" },
  ];

  const liveWorkspace =
    selected ? (
      <div
        id="mitsu-live-workspace"
        className="scroll-mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-white p-3"
      >
        <div className="sticky top-0 z-20 -mx-3 space-y-2 border-b border-gray-200 bg-white/95 px-3 pb-3 pt-0.5 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-emerald-700">Live · {selected.nameRu}</h3>
              <p className="font-mono text-[10px] text-gray-500">
                {selected.txCanId} → {selected.rxCanId}
              </p>
              {profileNote ? <p className="text-[10px] text-gray-500">{profileNote}</p> : null}
            </div>
            <button
              type="button"
              disabled={phase !== "vehicle" || busy || picked.length === 0}
              onClick={() => {
                if (live) {
                  stopLive.current = true;
                  setLive(false);
                  return;
                }
                void startLive();
              }}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 ${
                live ? "bg-amber-600" : "bg-emerald-600"
              }`}
            >
              {live ? "Стоп" : `Старт (${picked.length})`}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked(pickPreferredMonitorSignals(signals, MAX_LIVE))}
            >
              Датчики MUT-III
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked(signals.slice(0, MAX_LIVE).map((s) => s.id))}
            >
              Первые {MAX_LIVE}
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked([])}
            >
              Сброс
            </button>
          </div>
        </div>

        {pickedSignals.length > 0 ? (
          <LiveMetricCards
            items={pickedSignals.map((signal) => {
              void liveMinMaxTick;
              const stats = liveMinMaxRef.current.get(signal.id);
              return {
                id: signal.id,
                label: signal.nameRu || signal.nameEn,
                value: liveNow[signal.id] ?? "—",
                unit: signal.unit,
                minText: stats ? String(stats.min) : null,
                maxText: stats ? String(stats.max) : null,
                highlight: live,
              };
            })}
          />
        ) : (
          <p className="text-xs text-gray-500">Отметьте параметры в «Настройка» ниже.</p>
        )}

        <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-700">
            Настройка параметров ({picked.length}/{MAX_LIVE})
          </summary>
          <input
            value={signalQuery}
            onChange={(event) => setSignalQuery(event.target.value)}
            placeholder="Поиск"
            className="mt-2 w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-900"
          />
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {visibleSignals.map((signal) => {
              const checked = picked.includes(signal.id);
              return (
                <li key={signal.id}>
                  <label className="flex items-center gap-2 text-xs text-gray-800">
                    <input type="checkbox" checked={checked} onChange={() => toggleSignal(signal.id)} />
                    <span className="min-w-0 flex-1 truncate">{signal.nameRu || signal.nameEn}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={samples.length === 0}
            onClick={downloadCsv}
            className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 disabled:opacity-40"
          >
            CSV ({samples.length})
          </button>
        </details>
        <LiveChart signals={pickedSignals} samples={samples} />
      </div>
    ) : null;

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {vehicles.length > 0 ? (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-gray-500">
            <span>Машина</span>
            <select
              value={vehicle?.vkey ?? ""}
              onChange={(event) => {
                if (event.target.value) void chooseVehicle(event.target.value);
              }}
              className="w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-900"
            >
              <option value="">Выберите</option>
              {vehicles.map((item) => (
                <option key={item.vkey} value={item.vkey}>
                  {item.nameRu}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void identify()}
          className="rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          По VIN
        </button>
        <button
          type="button"
          disabled={busy || phase !== "vehicle" || !vehicle}
          onClick={() => void scan()}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 disabled:opacity-40"
        >
          DTC
        </button>
      </div>
      {vin ? <p className="truncate font-mono text-[10px] text-gray-500">VIN {vin}</p> : null}
      {status ? <p className="text-xs text-emerald-800">{status}</p> : null}
      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</p>
      ) : null}
      {phase !== "vehicle" ? (
        <p className="text-xs text-gray-500">Подключите vLinker для опроса блоков.</p>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">АКПП / CVT · температура масла</h3>
            <p className="text-[11px] text-gray-500">
              MUT-III SE Data List: 8AT V8AWG (Pajero Sport) труба/картер A−50; CVT Outlander 21 03 A−55.
              Уровень масла проверяют при 70–80 °C, селектор P, холостой ход.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={phase !== "vehicle" || busy}
              onClick={() => void readTcmOnce()}
              className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Считать TCM 7E1
            </button>
            <button
              type="button"
              disabled={phase !== "vehicle" || busy}
              onClick={() => void toggleTcmLive()}
              className={`rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 ${
                tcmLive ? "bg-amber-600" : "border border-emerald-600 bg-emerald-600"
              }`}
            >
              {tcmLive ? "Стоп live" : "Live АКПП"}
            </button>
          </div>
        </div>
        {tcm ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {tcm.transmissionType === "CVT" ? "Масло CVT" : "ATF (картер / труба)"}
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-800">
                {tcm.atfTempC != null ? `${tcm.atfTempC} °C` : "—"}
              </div>
              {tcm.atfTempC != null ? (
                <div className="mt-1 text-[11px] font-medium text-gray-800">
                  {mitsubishiFluidBand(tcm.atfTempC, tcm.transmissionType).labelRu}
                </div>
              ) : null}
              <div className="mt-1 font-mono text-[10px] text-gray-500">
                {tcm.atfFormula === "a-55" ? "MUT-III A−55" : "MUT-III A−50"}
                {tcm.atfTempPipeC != null ? ` · труба ${tcm.atfTempPipeC} °C` : ""}
                {tcm.atfTempPanC != null ? ` · картер ${tcm.atfTempPanC} °C` : ""}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Передача</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{tcm.currentGearText}</div>
              <div className="mt-1 text-[11px] text-gray-500">Селектор: {tcm.selectorPosition}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Валы / скорость</div>
              <div className="mt-1 text-xs text-gray-800">
                In {tcm.inputShaftRpm ?? "—"} · Out {tcm.outputShaftRpm ?? "—"} об/мин
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {tcm.vehicleSpeedKmh != null ? `${tcm.vehicleSpeedKmh} км/ч` : "скорость —"}
                {tcm.cvtDegradationCount != null ? ` · деградация CVT ${tcm.cvtDegradationCount}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Зажигание ON. На Pajero Sport III читается 8AT, на Outlander III — вариатор.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={phase !== "vehicle" || busy}
            onClick={() => void readTpmsOnce()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] text-gray-800 disabled:opacity-40"
          >
            Шины TPMS
          </button>
          <button
            type="button"
            disabled={phase !== "vehicle" || busy}
            onClick={() => void readMeterOnce()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] text-gray-800 disabled:opacity-40"
          >
            Топливо / пробег
          </button>
          {vehicle?.ecus.find((ecu) => isTransmissionEcu(ecu.nameEn, ecu.nameRu)) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const ecu = vehicle.ecus.find((item) => isTransmissionEcu(item.nameEn, item.nameRu));
                if (ecu) void openEcu(ecu);
              }}
              className="rounded-lg border border-emerald-700 px-3 py-1.5 text-[11px] text-emerald-800 disabled:opacity-40"
            >
              Data List АКПП из MUT-III
            </button>
          ) : null}
        </div>
        {tpms ? (
          <div className="grid grid-cols-2 gap-2">
            {tpms.wheels.slice(0, 4).map((wheel) => (
              <div key={wheel.wheelIndex} className="rounded-lg border border-gray-200 p-2">
                <div className="text-[10px] font-semibold text-gray-700">{wheel.defaultLabel}</div>
                <div className="font-mono text-sm text-gray-900">
                  {wheel.pressureBar != null ? `${wheel.pressureBar.toFixed(2)} бар` : "—"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {wheel.temperatureC != null ? `${wheel.temperatureC} °C` : ""} {wheel.statusText}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {meter ? (
          <p className="text-xs text-gray-700">
            Топливо {meter.fuelLiters != null ? `${meter.fuelLiters} л` : "—"} · пробег{" "}
            {meter.odometerKm != null ? `${meter.odometerKm} км` : "—"}
          </p>
        ) : null}
      </div>

      {vehicle ? (
        <div className="flex flex-wrap gap-1.5">
          {serviceButtons.map((item) => {
            const ecu = vehicle.ecus.find((candidate) =>
              ecuMatchesServiceSet(candidate.nameEn, candidate.nameRu, item.set),
            );
            if (!ecu) return null;
            return (
              <button
                key={item.set}
                type="button"
                disabled={busy}
                onClick={() => void openEcu(ecu, item.set)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] text-gray-800 disabled:opacity-40"
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={downloadVisit}
            className="rounded-lg border border-gray-900 px-3 py-1.5 text-[11px] font-medium text-gray-900"
          >
            Отчёт визита
          </button>
        </div>
      ) : null}

      {liveWorkspace}

      <details className="rounded-xl border border-gray-200 bg-gray-50 p-2" open={!selected}>
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">
          Блоки и ошибки {vehicle ? `(${vehicle.ecus.length})` : ""}
        </summary>
      <div className="mt-2 flex flex-col gap-2">
        {vehicle?.ecus.map((ecu) => {
          const report = reports[addressKey(ecu.txCanId, ecu.rxCanId)];
          const master = texts[ecu.dtcMasterId] ?? {};
          const active = selectedKey === ecu.sysKey;
          return (
            <article
              key={ecu.sysKey}
              className={`rounded-xl border p-3 ${active ? "border-emerald-600 bg-white" : "border-gray-200 bg-gray-50"}`}
            >
              <button type="button" onClick={() => void openEcu(ecu)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{ecu.nameRu}</h3>
                  <span className="font-mono text-[10px] text-gray-500">
                    {ecu.txCanId}→{ecu.rxCanId}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {report
                    ? report.responded
                      ? `${report.dtcs.length} ошибок${report.partNumber ? ` · ${report.partNumber}` : ""}`
                      : "нет ответа"
                    : "ещё не опрошен"}
                </p>
              </button>
              {report && report.dtcs.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {report.dtcs.map((dtc) => (
                    <li key={dtc.code} className="rounded bg-gray-100 px-2 py-1.5">
                      <div>
                        <span className="font-mono text-amber-900">{dtc.code}</span>{" "}
                        {master[dtc.code]?.ru || dtc.description}
                        {dtc.active ? "" : " · в памяти"}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-gray-500">
                        {dtc.remedy ?? remedyForDtcCode(dtc.code)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {ecu.canSafeClear && report?.responded ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clearEcu(ecu)}
                    className="rounded border border-gray-300 px-2 py-1 text-gray-800 disabled:opacity-40"
                  >
                    Сбросить ошибки
                  </button>
                ) : null}
                {ecu.coding ? (
                  <Link
                    href={`/tools/etacs-coding?scenario=${ecu.coding === "engine" ? "engine_kon" : "etacs_kon"}`}
                    className="rounded border border-emerald-800 px-2 py-1 text-emerald-800"
                  >
                    Кодирование
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      </details>
    </section>
  );
}

function LiveChart({ signals, samples }: { signals: CatalogSignal[]; samples: Sample[] }) {
  if (signals.length === 0 || samples.length < 2) return null;
  const width = 320;
  const height = 96;
  const colors = ["#34d399", "#38bdf8", "#fbbf24", "#f472b6"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-24 w-full" role="img" aria-label="График параметров">
      {signals.map((signal, index) => {
        const series = samples.map((sample) => sample.values[signal.id]).filter((value): value is number => value != null);
        if (series.length < 2) return null;
        const min = Math.min(...series);
        const max = Math.max(...series);
        const span = max - min || 1;
        const points = samples
          .map((sample, sampleIndex) => {
            const value = sample.values[signal.id];
            if (value == null) return null;
            const x = (sampleIndex / (samples.length - 1)) * width;
            const y = height - ((value - min) / span) * (height - 8) - 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .filter((point): point is string => point != null)
          .join(" ");
        return (
          <polyline
            key={signal.id}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="1.5"
            points={points}
          />
        );
      })}
    </svg>
  );
}
