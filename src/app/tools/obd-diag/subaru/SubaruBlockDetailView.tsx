"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import type { ModuleDtcReport, ObdBleSession } from "@/lib/obd/obd-session";
import {
  buildSsm4RequestHex,
  decodeSsm4SignalPayload,
  type Ssm4SignalDef,
  type Ssm4SystemEntry,
} from "@/lib/obd/subaru-ssm4-catalog";
import {
  classifySubaruDtcStatus,
  formatSubaruUserValue,
  getSubaruBlockProfile,
  getSubaruBlockScanStatus,
  isSubaruTxSafeToClear,
  type SubaruFunctionTabId,
} from "@/lib/obd/subaru-ssm4-modules";
import { LiveMetricCards } from "../LiveMetricCards";
import {
  SubaruFunctionPageView,
  type SelectedBlockFunction,
} from "./SubaruFunctionPageView";

interface Props {
  system: Ssm4SystemEntry;
  session: ObdBleSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  report?: ModuleDtcReport;
  onScanSingle: (txHex: string, rxHex: string, title: string) => void;
  onClearSingle: (txHex: string, rxHex: string, title: string) => void;
  onBackToList: () => void;
}

const TAB_LABELS: Record<SubaruFunctionTabId, string> = {
  dtc: "F1 DTC",
  "cancel-code": "F2 Cancel Code",
  "data-monitor": "F3 Data Monitor",
  "active-test": "F4 Active Test",
  "work-support": "F5 Work Support",
  customize: "F6 Customize",
  "ecu-info": "F10 ECU Info",
};

const MAX_LIVE = 16;

interface EcuInfoRow {
  label: string;
  didHex: string;
  value: string;
}

export function SubaruBlockDetailView({
  system,
  session,
  ready,
  busy,
  setBusy,
  setError,
  report,
  onScanSingle,
  onClearSingle,
  onBackToList,
}: Props) {
  const profile = useMemo(() => getSubaruBlockProfile(system), [system]);
  const [activeTab, setActiveTab] = useState<SubaruFunctionTabId>("dtc");
  const [selectedFn, setSelectedFn] = useState<SelectedBlockFunction | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Data Monitor state
  const [customListFilter, setCustomListFilter] = useState<string>("ALL");
  const [sigQuery, setSigQuery] = useState("");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [liveActive, setLiveActive] = useState(false);
  const [liveValues, setLiveValues] = useState<Record<string, { text: string; numeric: number | null }>>({});
  const [csvSamples, setCsvSamples] = useState<Array<{ t: number; values: Record<string, number | null> }>>([]);
  const liveStopRef = useRef(false);
  const minMaxRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  const [minMaxTick, setMinMaxTick] = useState(0);

  // Customize state
  const [customizeValues, setCustomizeValues] = useState<Record<string, string>>({});

  // ECU Info state
  const [ecuInfoRows, setEcuInfoRows] = useState<EcuInfoRow[]>([]);

  useEffect(() => {
    setSelectedFn(null);
    setActiveTab("dtc");
    setConfirmClear(false);
    liveStopRef.current = true;
    setLiveActive(false);
    setPickedIds(profile.signals.slice(0, 8).map((s) => s.id));
    setEcuInfoRows([]);
    setCustomizeValues({});
  }, [system.id, profile.signals]);

  useEffect(() => {
    return () => {
      liveStopRef.current = true;
    };
  }, []);

  const customLists = useMemo(() => {
    const set = new Set<string>();
    for (const s of profile.signals) {
      if (s.customList) set.add(s.customList);
    }
    return ["ALL", ...Array.from(set)];
  }, [profile.signals]);

  const visibleSignals = useMemo(() => {
    const q = sigQuery.trim().toLowerCase();
    return profile.signals.filter((s) => {
      if (customListFilter !== "ALL" && s.customList !== customListFilter) return false;
      if (!q) return true;
      return `${s.nameEn} ${s.nameRu} ${s.shortName}`.toLowerCase().includes(q);
    });
  }, [profile.signals, customListFilter, sigQuery]);

  const pickedSignals = useMemo(
    () => profile.signals.filter((s) => pickedIds.includes(s.id)),
    [profile.signals, pickedIds],
  );

  // If Level 3 (specific function page) is open, render it exclusively
  if (selectedFn) {
    return (
      <SubaruFunctionPageView
        system={system}
        selectedFn={selectedFn}
        session={session}
        ready={ready}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        onBack={() => setSelectedFn(null)}
      />
    );
  }

  const toggleSignal = (id: string) => {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_LIVE) return prev;
      return [...prev, id];
    });
  };

  const toggleLiveMonitor = async () => {
    if (liveActive) {
      liveStopRef.current = true;
      setLiveActive(false);
      return;
    }
    if (!ready || pickedSignals.length === 0) return;
    liveStopRef.current = false;
    setLiveActive(true);
    setError(null);
    minMaxRef.current.clear();

    try {
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 03", false);
      } catch {
        /* some ECUs don't require 10 03 for Mode 01 / 22 */
      }

      while (!liveStopRef.current) {
        const nextValues: Record<string, { text: string; numeric: number | null }> = {};
        const numericRow: Record<string, number | null> = {};

        // Group identical requests (e.g. same DID/PID) to avoid duplicate CAN traffic
        const byReq = new Map<string, { reqSpaced: string; signals: Ssm4SignalDef[] }>();
        for (const sig of pickedSignals) {
          const built = buildSsm4RequestHex(sig);
          const cleanReq = built.requestHex.replace(/\s+/g, "").toUpperCase();
          const bucket = byReq.get(cleanReq);
          if (bucket) {
            bucket.signals.push(sig);
          } else {
            byReq.set(cleanReq, { reqSpaced: built.requestHex, signals: [sig] });
          }
        }

        for (const group of byReq.values()) {
          if (liveStopRef.current) break;
          try {
            const { parsed } = await session.sendUds(
              "6",
              system.txHex,
              system.rxHex,
              group.reqSpaced,
              false,
            );
            for (const sig of group.signals) {
              const decoded =
                parsed.kind === "positive"
                  ? decodeSsm4SignalPayload(sig, parsed.payload)
                  : null;
              nextValues[sig.id] = {
                text: decoded?.text ?? "—",
                numeric: decoded?.numeric ?? null,
              };
              numericRow[sig.id] = decoded?.numeric ?? null;
              if (decoded?.numeric != null && !Number.isNaN(decoded.numeric)) {
                const prev = minMaxRef.current.get(sig.id);
                minMaxRef.current.set(sig.id, {
                  min: prev ? Math.min(prev.min, decoded.numeric) : decoded.numeric,
                  max: prev ? Math.max(prev.max, decoded.numeric) : decoded.numeric,
                });
              }
            }
          } catch {
            for (const sig of group.signals) {
              nextValues[sig.id] = { text: "—", numeric: null };
              numericRow[sig.id] = null;
            }
          }
        }

        if (liveStopRef.current) break;
        setMinMaxTick((t) => t + 1);
        setLiveValues(nextValues);
        setCsvSamples((prev) => [...prev, { t: Date.now(), values: numericRow }].slice(-120));
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Сбой Data Monitor");
    } finally {
      liveStopRef.current = true;
      setLiveActive(false);
    }
  };

  const downloadMonitorCsv = () => {
    const header = ["time", ...pickedSignals.map((s) => s.nameRu || s.nameEn)];
    const lines = [
      header.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
      ...csvSamples.map((sample) =>
        [
          new Date(sample.t).toISOString(),
          ...pickedSignals.map((s) =>
            sample.values[s.id] == null ? "" : String(sample.values[s.id]),
          ),
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `subaru-${system.abbr.toLowerCase()}-monitor.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const readEcuInfo = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 03", false);
      } catch {
        /* ignore */
      }

      const probes: Array<{ label: string; cmd: string; sid: number; didHex: string }> = [
        { label: "ECU Parts Number", cmd: "22 F1 87", sid: 0x22, didHex: "F187" },
        { label: "Subaru Part Number", cmd: "22 F1 8E", sid: 0x22, didHex: "F18E" },
        { label: "Software Information", cmd: "22 F1 89", sid: 0x22, didHex: "F189" },
        { label: "Calibration ID", cmd: "22 F1 82", sid: 0x22, didHex: "F182" },
        { label: "Boot Software", cmd: "22 F1 80", sid: 0x22, didHex: "F180" },
        { label: "System Name", cmd: "22 F1 97", sid: 0x22, didHex: "F197" },
        { label: "VIN", cmd: "22 F1 90", sid: 0x22, didHex: "F190" },
        { label: "Счётчик запусков и таймер IG", cmd: "22 10 1E", sid: 0x22, didHex: "101E" },
      ];
      if (system.txHex === "7E0" || system.txHex === "7E1") {
        probes.push(
          { label: "OBD Calibration ID", cmd: "09 04", sid: 0x09, didHex: "0904" },
          { label: "OBD CVN", cmd: "09 06", sid: 0x09, didHex: "0906" },
        );
      }

      const out: EcuInfoRow[] = [];
      for (const p of probes) {
        try {
          const { parsed } = await session.sendUds("6", system.txHex, system.rxHex, p.cmd, false);
          if (parsed.kind === "positive") {
            out.push({
              label: p.label,
              didHex: p.didHex,
              value: formatSubaruUserValue(parsed.payload, p.sid, system.txHex),
            });
          } else {
            out.push({
              label: p.label,
              didHex: p.didHex,
              value: parsed.kind === "negative" ? "Не поддерживается" : "Нет ответа",
            });
          }
        } catch {
          out.push({ label: p.label, didHex: p.didHex, value: "Нет ответа" });
        }
      }
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 01", false);
      } catch {
        /* ignore */
      }
      setEcuInfoRows(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения ECU Info");
    } finally {
      setBusy(false);
    }
  };

  const readCustomizeCurrent = async () => {
    if (!ready || profile.customizeItems.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 03", false);
      } catch {
        /* ignore */
      }

      const uniqueDids = Array.from(new Set(profile.customizeItems.map((i) => i.didHex.toUpperCase())));
      const didResponses: Record<string, string> = {};
      for (const did of uniqueDids) {
        try {
          const { parsed } = await session.sendUds(
            "6",
            system.txHex,
            system.rxHex,
            `22 ${did.slice(0, 2)} ${did.slice(2)}`,
            false,
          );
          didResponses[did] =
            parsed.kind === "positive"
              ? formatSubaruUserValue(parsed.payload, 0x22, system.txHex)
              : "Нет ответа / отказ";
        } catch {
          didResponses[did] = "Ошибка чтения";
        }
      }
      const next: Record<string, string> = {};
      for (const item of profile.customizeItems) {
        next[item.id] = didResponses[item.didHex.toUpperCase()] ?? "—";
      }
      setCustomizeValues(next);
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 01", false);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения Customize");
    } finally {
      setBusy(false);
    }
  };

  const scanStatus = getSubaruBlockScanStatus(report);
  const safeToClear = isSubaruTxSafeToClear(system.txHex);

  return (
    <div className="space-y-3">
      {/* Level 2 Header (Selected Block) */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
          >
            ← К списку блоков
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-gray-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
              {system.abbr}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {system.group}
            </span>
            {scanStatus !== "unscanned" && (
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                  scanStatus === "current"
                    ? "bg-red-600 text-white"
                    : scanStatus === "history"
                      ? "bg-amber-500 text-white"
                      : scanStatus === "no_dtc"
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-200 text-gray-600"
                }`}
              >
                {scanStatus === "current"
                  ? "Current DTC"
                  : scanStatus === "history"
                    ? "History DTC"
                    : scanStatus === "no_dtc"
                      ? "No DTC"
                      : "Нет ответа"}
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-gray-900">{system.nameEn}</h3>
          <p className="text-xs text-gray-600">{system.nameRu}</p>
        </div>

        {/* Select Function Tabs (SSM4 Left Menu) */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
          {profile.tabs.map((tabId) => {
            const active = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-gray-900 text-white shadow-2xs"
                    : "text-gray-600 hover:bg-white hover:text-gray-900"
                }`}
              >
                {TAB_LABELS[tabId]}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: F1 DTC */}
      {activeTab === "dtc" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                F1 DTC · Диагностические коды неисправностей
              </h4>
              <p className="text-[11px] text-gray-500">
                Считывает текущие (Current) и сохранённые (History) ошибки выбранного блока.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  onScanSingle(system.txHex, system.rxHex, `${system.nameEn} (${system.abbr})`)
                }
                className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Считать ошибки
              </button>
              {safeToClear ? (
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => setConfirmClear(true)}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40"
                >
                  Очистить DTC
                </button>
              ) : (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                  Только чтение (защита калибровок)
                </span>
              )}
            </div>
          </div>

          {confirmClear && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs space-y-2">
              <div className="font-bold text-red-950">
                Очистить ошибки в блоке {system.nameEn}?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmClear(false);
                    onClearSingle(system.txHex, system.rxHex, `${system.nameEn} (${system.abbr})`);
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Да, очистить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {!report ? (
            <p className="text-xs text-gray-500">
              Нажмите «Считать ошибки» для опроса этого блока.
            </p>
          ) : !report.responded ? (
            <p className="text-xs text-gray-500">
              Блок не ответил ({report.rawStatus}).
            </p>
          ) : report.dtcs.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              No DTC · Ошибок в блоке не обнаружено.
            </div>
          ) : (
            <ul className="space-y-2">
              {report.dtcs.map((dtc) => {
                const sev = classifySubaruDtcStatus(dtc);
                return (
                  <li
                    key={dtc.code}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">
                        {dtc.code}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          sev === "current"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {sev === "current" ? "Current" : "History"}
                      </span>
                      <span className="font-medium text-gray-800">{dtc.description}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-600">
                      {dtc.remedy ?? remedyForDtcCode(dtc.code)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* TAB 2: F2 Cancel Code */}
      {activeTab === "cancel-code" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
          <div>
            <h4 className="text-sm font-bold text-gray-900">
              F2 Cancel Code · Причины временной отмены / остановки систем
            </h4>
            <p className="text-[11px] text-gray-500">
              Выберите пункт — откроется отдельная страница для считывания флагов отмены.
            </p>
          </div>
          {profile.cancelCodes.length === 0 ? (
            <p className="text-xs text-gray-500">
              Для этого блока нет отдельных регистров Cancel Code; проверьте вкладку F1 DTC.
            </p>
          ) : (
            <div className="space-y-2">
              {profile.cancelCodes.map((cc) => (
                <button
                  key={cc.id}
                  type="button"
                  onClick={() => setSelectedFn({ kind: "cancel-code", item: cc })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-900 hover:bg-white"
                >
                  <div>
                    <div className="text-xs font-bold text-gray-900">{cc.nameEn}</div>
                    <div className="text-[11px] text-gray-600">{cc.nameRu}</div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-gray-900">
                    Открыть →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: F3 Data Monitor */}
      {activeTab === "data-monitor" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                F3 Data Monitor · Поток данных ({profile.signals.length} параметров)
              </h4>
              <p className="text-[11px] text-gray-500">
                Отметьте до {MAX_LIVE} параметров и запустите Live-опрос.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!ready || pickedSignals.length === 0}
                onClick={() => void toggleLiveMonitor()}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 ${
                  liveActive ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {liveActive ? "Стоп Live" : `Старт Live (${pickedSignals.length})`}
              </button>
              {csvSamples.length > 0 && (
                <button
                  type="button"
                  onClick={downloadMonitorCsv}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800"
                >
                  CSV ({csvSamples.length})
                </button>
              )}
            </div>
          </div>

          {pickedSignals.length > 0 && (
            <LiveMetricCards
              items={pickedSignals.map((sig) => {
                void minMaxTick;
                const mm = minMaxRef.current.get(sig.id);
                return {
                  id: sig.id,
                  label: sig.nameRu || sig.nameEn,
                  value: liveValues[sig.id]?.text ?? "—",
                  unit: sig.unit,
                  minText: mm ? String(mm.min) : null,
                  maxText: mm ? String(mm.max) : null,
                  highlight: liveActive,
                };
              })}
            />
          )}

          {profile.signals.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={sigQuery}
                  onChange={(e) => setSigQuery(e.target.value)}
                  placeholder="Фильтр параметров…"
                  className="w-full sm:w-56 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                />
                {customLists.length > 1 && (
                  <select
                    value={customListFilter}
                    onChange={(e) => setCustomListFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {customLists.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl === "ALL" ? "Все группы" : cl}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setPickedIds(visibleSignals.slice(0, MAX_LIVE).map((s) => s.id))
                  }
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700"
                >
                  Первые {MAX_LIVE}
                </button>
                <button
                  type="button"
                  onClick={() => setPickedIds([])}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700"
                >
                  Сбросить выбор
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
                {visibleSignals.map((sig) => {
                  const checked = pickedIds.includes(sig.id);
                  return (
                    <label
                      key={sig.id}
                      className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSignal(sig.id)}
                        />
                        <span className="truncate font-medium text-gray-900">
                          {sig.nameRu || sig.nameEn}
                        </span>
                      </span>
                      {sig.unit ? (
                        <span className="shrink-0 font-mono text-[10px] text-gray-500">
                          {sig.unit}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Для данного подмодуля используйте вкладку F10 ECU Info / F5 Work Support.
            </p>
          )}
        </div>
      )}

      {/* TAB 4: F4 Active Test */}
      {activeTab === "active-test" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
          <div>
            <h4 className="text-sm font-bold text-gray-900">
              F4 Active Test · Активные тесты исполнительных механизмов
            </h4>
            <p className="text-[11px] text-gray-500">
              Выберите тест — откроется отдельная страница теста с условиями и управлением.
            </p>
          </div>
          {profile.activeTests.length === 0 ? (
            <p className="text-xs text-gray-500">
              Для этого блока нет активных тестов в SSM4.
            </p>
          ) : (
            <div className="space-y-1.5">
              {profile.activeTests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  onClick={() => setSelectedFn({ kind: "active-test", item: test })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-900 hover:bg-white"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900">{test.nameEn}</div>
                    <div className="text-[11px] text-gray-600">{test.nameRu}</div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-900">
                    Открыть →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: F5 Work Support */}
      {activeTab === "work-support" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
          <div>
            <h4 className="text-sm font-bold text-gray-900">
              F5 Work Support · Сервисные функции и калибровки блока {system.abbr}
            </h4>
            <p className="text-[11px] text-gray-500">
              Выберите процедуру — откроется отдельная страница с описанием, предусловиями и запуском.
            </p>
          </div>

          {/* Standard SSM4 top 2 Work Support rows: ECU Parts Number & Software Information */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("ecu-info");
                if (ready && ecuInfoRows.length === 0) void readEcuInfo();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-900 hover:bg-white"
            >
              <div>
                <div className="text-xs font-bold text-gray-900">ECU Parts Number</div>
                <div className="text-[11px] text-gray-600">
                  Номер детали и аппаратная идентификация блока
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-900">Открыть →</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("ecu-info");
                if (ready && ecuInfoRows.length === 0) void readEcuInfo();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-900 hover:bg-white"
            >
              <div>
                <div className="text-xs font-bold text-gray-900">Software information</div>
                <div className="text-[11px] text-gray-600">
                  Версия ПО, CalID и CVN прошивки блока
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-900">Открыть →</span>
            </button>

            {profile.workSupport.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => setSelectedFn({ kind: "work-support", item: ws })}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-900 hover:bg-white"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-900">{ws.nameEn}</div>
                  <div className="text-[11px] text-gray-600">{ws.nameRu}</div>
                </div>
                <span className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-900">
                  Открыть →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: F6 Customize */}
      {activeTab === "customize" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                F6 Customize · Настройки персонализации блока {system.abbr}
              </h4>
              <p className="text-[11px] text-gray-500">
                Считывает текущие настройки блока и показывает доступные в SSM4 варианты.
              </p>
            </div>
            {profile.customizeItems.length > 0 && (
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void readCustomizeCurrent()}
                className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Считать текущие значения
              </button>
            )}
          </div>

          {profile.customizeItems.length === 0 ? (
            <p className="text-xs text-gray-500">
              Параметры Customize для данного подмодуля объединены в основном блоке (например, BIU или A/C).
            </p>
          ) : (
            <div className="space-y-2">
              {profile.customizeItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-gray-900">{item.nameEn}</div>
                    <div className="text-[11px] text-gray-600">{item.nameRu}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.options.map((opt) => (
                      <span
                        key={opt.labelEn}
                        className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700"
                      >
                        {opt.labelEn} ({opt.labelRu})
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-1.5 text-[11px]">
                    <span className="text-gray-500">По умолчанию: {item.defaultText}</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {customizeValues[item.id] ?? "Не прочитано"}
                    </span>
                  </div>
                  {item.noteRu && (
                    <div className="text-[10px] text-amber-800">{item.noteRu}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 7: F10 ECU Info */}
      {activeTab === "ecu-info" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                F10 ECU Info · Паспорт блока {system.nameEn}
              </h4>
              <p className="text-[11px] text-gray-500">
                ECU Parts Number, Software Information, Calibration ID, VIN и счётчик IG.
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void readEcuInfo()}
              className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Считать паспорт ЭБУ
            </button>
          </div>

          {ecuInfoRows.length === 0 ? (
            <p className="text-xs text-gray-500">
              Нажмите «Считать паспорт ЭБУ» при включённом зажигании.
            </p>
          ) : (
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
              {ecuInfoRows.map((row) => (
                <div
                  key={row.didHex}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-gray-700">{row.label}</span>
                  <span className="font-mono text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
