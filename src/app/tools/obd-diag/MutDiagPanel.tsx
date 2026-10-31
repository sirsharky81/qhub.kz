"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveMetricCards } from "./LiveMetricCards";
import type { CatalogEcu, CatalogSignal, CatalogVehicle, CatalogVehicleSummary } from "@/lib/etacs-coding/diag-catalog";
import { asciiFromKwpPayload, decodeCatalogSignal } from "@/lib/obd/mut-live";
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import {
  ObdBleSession,
  type ModuleDtcReport,
  type ModuleDtcTarget,
  type ObdConnectionPhase,
} from "@/lib/obd/obd-session";

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

  useEffect(() => {
    return () => {
      stopScan.current = true;
      stopLive.current = true;
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

  const openEcu = async (ecu: CatalogEcu) => {
    stopLive.current = true;
    setLive(false);
    setSelectedKey(ecu.sysKey);
    setSignalQuery("");
    setPicked([]);
    setSamples([]);
    setLiveNow({});
    setSignals([]);
    if (!vehicle) return;
    try {
      const response = await fetch(
        `/api/etacs-coding/diag/signals?vkey=${encodeURIComponent(vehicle.vkey)}&sysKey=${ecu.sysKey}`,
      );
      const body = (await response.json()) as { error?: string; signals?: CatalogSignal[] };
      if (!response.ok) throw new Error(body.error || "Список параметров недоступен");
      setSignals(body.signals ?? []);
      requestAnimationFrame(() => {
        document.getElementById("mitsu-live-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Список параметров недоступен");
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
              onClick={() => {
                const ids = signals
                  .filter((s) =>
                    /ATF|темп|temp|°C|CVT|акпп|масл|oil|fluid|AT|TCM/i.test(
                      `${s.nameRu} ${s.nameEn} ${s.unit}`,
                    ),
                  )
                  .slice(0, MAX_LIVE)
                  .map((s) => s.id);
                setPicked(ids);
              }}
            >
              ATF / темп.
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
