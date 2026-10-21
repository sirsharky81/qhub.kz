import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FileSearch,
  Gauge,
  Layers,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  ModuleDtcReport,
  ObdSession,
  SubaruConfigDump,
  SubaruDumpDiffItem,
  TpmsSensorReading,
} from "@/lib/obd/obd-session";
import { diffSubaruDumps } from "@/lib/obd/obd-session";
import { formatUdsPayload, parseUdsResponse } from "@/lib/obd/uds";
import {
  SSM4_CUSTOMIZE_ITEMS,
  SSM4_ECUS,
  SSM4_SIGNALS,
  SSM4_UTILITIES,
  SSM4_VEHICLES,
  SUBARU_CANADIAN_OPTION_PRESETS,
  buildSsm4RequestHex,
  decodeSsm4SignalPayload,
  decodeSubaruAppliedModel12Columns,
  extractAppliedModelAndOptionCodeFromDump,
  matchSsm4VehicleByVin,
  type Ssm4EcuDef,
  type Ssm4Group,
  type Ssm4SignalDef,
  type Ssm4UtilitySpec,
} from "@/lib/obd/subaru-ssm4-catalog";

interface Props {
  session: ObdSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  vinHint?: string | null;
}

type Ssm4TopView =
  | "all-dtc"
  | "ecu-diag"
  | "data-monitor"
  | "customize"
  | "utilities";

interface LiveValueEntry {
  text: string;
  numeric: number | null;
  min: number | null;
  max: number | null;
  updatedAt: string;
}

interface SamplePoint {
  t: number; // ms since monitor start
  values: Record<string, number>;
}

interface TriggerConfig {
  enabled: boolean;
  signalId: string;
  slope: "above" | "below" | "equal";
  threshold: number;
  triggeredAtMs: number | null;
}

interface EcuUnitPassport {
  ecuCode: string;
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  softwareVersion: string | null;
  calibrationId: string | null;
  systemName: string | null;
  vin: string | null;
}

export function SubaruSsmPanel({
  session,
  ready,
  busy,
  setBusy,
  setError,
  vinHint,
}: Props) {
  const [topView, setTopView] = useState<Ssm4TopView>("all-dtc");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(SSM4_VEHICLES[0]!.id);
  const [detectedVin, setDetectedVin] = useState<string | null>(vinHint ?? null);
  const [selectedGroup, setSelectedGroup] = useState<Ssm4Group | "ALL">("ALL");
  const [selectedEcuId, setSelectedEcuId] = useState<number>(234);
  const [selectedCustomList, setSelectedCustomList] = useState<string>("Diagnosis");

  // All-System DTC scan state
  const [dtcReports, setDtcReports] = useState<ModuleDtcReport[]>([]);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scanStatusMsg, setScanStatusMsg] = useState<string | null>(null);
  const stopScanRef = useRef(false);

  // Unit Info / Passport per ECU
  const [unitPassport, setUnitPassport] = useState<EcuUnitPassport | null>(null);
  const [freezeFrameSummary, setFreezeFrameSummary] = useState<
    { label: string; value: string }[]
  >([]);

  // Data Monitor state
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([
    "eng-coolant-ssm",
    "eng-rpm-ssm",
    "eng-speed-ssm",
    "eng-ign-timing-ssm",
    "eng-af-corr-1-ssm",
    "eng-af-learn-1-ssm",
  ]);
  const [liveValues, setLiveValues] = useState<Record<string, LiveValueEntry>>({});
  const [samples, setSamples] = useState<SamplePoint[]>([]);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef(false);
  const monitorStartRef = useRef<number>(0);

  // Graph Cursors A & B (index in samples)
  const [cursorAIdx, setCursorAIdx] = useState<number>(0);
  const [cursorBIdx, setCursorBIdx] = useState<number>(0);
  const [trigger, setTrigger] = useState<TriggerConfig>({
    enabled: false,
    signalId: "eng-rpm-ssm",
    slope: "above",
    threshold: 2500,
    triggeredAtMs: null,
  });

  // Customize & Config Diff state
  const [customizeValues, setCustomizeValues] = useState<Record<string, string>>({});
  const [configDumpA, setConfigDumpA] = useState<SubaruConfigDump | null>(null);
  const [configDumpB, setConfigDumpB] = useState<SubaruConfigDump | null>(null);
  const [configProgress, setConfigProgress] = useState<string | null>(null);
  const [appliedModelInput, setAppliedModelInput] = useState<string>("BTACYRB");
  const [optionCodeInput, setOptionCodeInput] = useState<string>("U45D");

  const appliedModelAnalysis = useMemo(
    () => decodeSubaruAppliedModel12Columns(appliedModelInput, optionCodeInput),
    [appliedModelInput, optionCodeInput],
  );

  // Utility / Calibration Inspection state
  const [selectedUtilityId, setSelectedUtilityId] = useState<string>(
    SSM4_UTILITIES[0]!.id,
  );
  const [utilityLiveDids, setUtilityLiveDids] = useState<
    Record<string, { rawHex: string; decoded: string }>
  >({});
  const [tpmsSensors, setTpmsSensors] = useState<TpmsSensorReading[]>([]);

  useEffect(() => {
    if (vinHint) {
      setDetectedVin(vinHint);
      const matched = matchSsm4VehicleByVin(vinHint);
      if (matched) setSelectedVehicleId(matched.id);
    }
  }, [vinHint]);

  useEffect(() => {
    return () => {
      pollingRef.current = false;
      stopScanRef.current = true;
    };
  }, []);

  const selectedVehicle = useMemo(
    () => SSM4_VEHICLES.find((v) => v.id === selectedVehicleId) ?? SSM4_VEHICLES[0]!,
    [selectedVehicleId],
  );

  const selectedEcu = useMemo<Ssm4EcuDef>(
    () => SSM4_ECUS.find((e) => e.ecuId === selectedEcuId) ?? SSM4_ECUS[0]!,
    [selectedEcuId],
  );

  const filteredEcus = useMemo(
    () =>
      selectedGroup === "ALL"
        ? SSM4_ECUS
        : SSM4_ECUS.filter((e) => e.group === selectedGroup),
    [selectedGroup],
  );

  const signalsForEcu = useMemo(
    () =>
      SSM4_SIGNALS.filter(
        (s) =>
          s.ecuId === selectedEcu.ecuId &&
          (selectedCustomList === "All Data" || s.customList === selectedCustomList),
      ),
    [selectedEcu.ecuId, selectedCustomList],
  );

  const selectedUtility = useMemo<Ssm4UtilitySpec>(
    () =>
      SSM4_UTILITIES.find((u) => u.id === selectedUtilityId) ?? SSM4_UTILITIES[0]!,
    [selectedUtilityId],
  );

  // Switch ECU helper: update default Custom List and selected signals
  const handleSelectEcu = useCallback((ecu: Ssm4EcuDef) => {
    pollingRef.current = false;
    setPolling(false);
    setSelectedEcuId(ecu.ecuId);
    const defaultList = ecu.customLists[1] ?? ecu.customLists[0] ?? "All Data";
    setSelectedCustomList(defaultList);
    const ecuSigs = SSM4_SIGNALS.filter((s) => s.ecuId === ecu.ecuId);
    setSelectedSignalIds(ecuSigs.slice(0, 6).map((s) => s.id));
  }, []);

  // Auto-detect vehicle by VIN (Mode 09 02 or UDS 22 F190)
  const handleAutoDetectVin = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const info = await session.readVehicleIdent("can11-500", 0x7e0, 0x7e8);
      if (info.vin) {
        setDetectedVin(info.vin);
        const matched = matchSsm4VehicleByVin(info.vin);
        if (matched) {
          setSelectedVehicleId(matched.id);
          setScanStatusMsg(
            `Автомобиль определён по VIN ${info.vin}: ${matched.nameRu}`,
          );
        } else {
          setScanStatusMsg(`Прочитан VIN: ${info.vin}`);
        }
      } else {
        setScanStatusMsg("ЭБУ не вернул VIN по запросу 22 F190 / 09 02");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения VIN");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  // SSM4 Function 918: All-System Diagnostic Code Check
  const handleRunAllDtcScan = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setScanStatusMsg(null);
    stopScanRef.current = false;
    setScanProgress("Запуск опроса всех систем Subaru (Powertrain · Chassis · Body)…");
    try {
      const allReports = await session.scanAllModuleDtcs(
        "can11-500",
        (msg, partial) => {
          setScanProgress(msg);
          // Filter out Mitsubishi-only 6xx/773 modules so the table shows Subaru systems cleanly
          const subaruTxSet = new Set(SSM4_ECUS.map((e) => e.txHex.toUpperCase()));
          setDtcReports(
            partial.filter((r) => subaruTxSet.has(r.txHex.toUpperCase())),
          );
        },
        () => stopScanRef.current,
      );
      const subaruTxSet = new Set(SSM4_ECUS.map((e) => e.txHex.toUpperCase()));
      const subaruReports = allReports.filter((r) =>
        subaruTxSet.has(r.txHex.toUpperCase()),
      );
      setDtcReports(subaruReports);
      const respondedCount = subaruReports.filter((r) => r.responded).length;
      const totalDtcs = subaruReports.reduce((acc, r) => acc + r.dtcs.length, 0);
      setScanStatusMsg(
        `Опрос систем SSM4 завершён: ответили ${respondedCount} из ${subaruReports.length} блоков, кодов неисправностей: ${totalDtcs}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка опроса всех систем Subaru");
    } finally {
      setScanProgress(null);
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  // Safe Clear DTCs for a specific non-safety ECU
  const handleClearModuleDtc = useCallback(
    async (txHex: string, rxHex: string, title: string) => {
      if (!ready || busy) return;
      setBusy(true);
      setError(null);
      setScanStatusMsg(null);
      try {
        const res = await session.clearModuleDtcsSafe("can11-500", txHex, rxHex);
        setScanStatusMsg(`${title}: ${res}`);
        setDtcReports((prev) =>
          prev.map((r) =>
            r.txHex.toUpperCase() === txHex.toUpperCase()
              ? { ...r, dtcs: [], rawStatus: "0 ошибок (очищено)" }
              : r,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сброса DTC");
      } finally {
        setBusy(false);
      }
    },
    [ready, busy, session, setBusy, setError],
  );

  // SSM4 Function 909 & Function 1: Read Unit Passport + Freeze Frame on selected ECU
  const handleReadEcuPassportAndFreeze = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const txNum = Number.parseInt(selectedEcu.txHex, 16);
    const rxNum = Number.parseInt(selectedEcu.rxHex, 16);
    try {
      const ident = await session.readVehicleIdent("can11-500", txNum, rxNum);
      let swVer: string | null = null;
      let sysName: string | null = null;

      try {
        const raw97 = await session.sendUdsRaw(
          "can11-500",
          selectedEcu.txHex,
          selectedEcu.rxHex,
          "22 F197",
          1200,
        );
        const p97 = parseUdsResponse(raw97, 0x22);
        if (p97.kind === "positive" && p97.payload.length > 2) {
          sysName = formatUdsPayload(p97.payload, 0x22, selectedEcu.txHex);
        }
      } catch {
        /* ignore */
      }

      try {
        const raw89 = await session.sendUdsRaw(
          "can11-500",
          selectedEcu.txHex,
          selectedEcu.rxHex,
          "22 F189",
          1200,
        );
        const p89 = parseUdsResponse(raw89, 0x22);
        if (p89.kind === "positive" && p89.payload.length > 2) {
          swVer = formatUdsPayload(p89.payload, 0x22, selectedEcu.txHex);
        }
      } catch {
        /* ignore */
      }

      setUnitPassport({
        ecuCode: selectedEcu.code,
        txHex: selectedEcu.txHex,
        rxHex: selectedEcu.rxHex,
        partNumber: ident.ecuPartNumber,
        softwareVersion: swVer,
        calibrationId: ident.calibrationId,
        systemName: sysName ?? selectedEcu.nameEn,
        vin: ident.vin,
      });

      // Read Freeze Frame / IG Counter (DID 101E + Mode 02 on Engine)
      const ffItems: { label: string; value: string }[] = [];
      try {
        const raw101e = await session.sendUdsRaw(
          "can11-500",
          selectedEcu.txHex,
          selectedEcu.rxHex,
          "22 101E",
          1200,
        );
        const p101e = parseUdsResponse(raw101e, 0x22);
        if (p101e.kind === "positive" && p101e.payload.length > 2) {
          ffItems.push({
            label: "Счётчик запусков и таймер IG-ON (DID 101E)",
            value: formatUdsPayload(p101e.payload, 0x22, selectedEcu.txHex),
          });
        }
      } catch {
        /* ignore */
      }

      if (selectedEcu.txHex === "7E0") {
        try {
          const ff = await session.readFreezeFrame();
          for (const row of ff) {
            ffItems.push({ label: row.label, value: row.value });
          }
        } catch {
          /* ignore */
        }
      }
      setFreezeFrameSummary(ffItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения паспорта блока");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, selectedEcu, session, setBusy, setError]);

  // SSM4 Function 2: Data Monitor single pass or continuous polling
  const pollSignalsOnce = useCallback(
    async (signalsToPoll: Ssm4SignalDef[], elapsedMs: number) => {
      const pointValues: Record<string, number> = {};
      for (const sig of signalsToPoll) {
        const ecu = SSM4_ECUS.find((e) => e.ecuId === sig.ecuId) ?? selectedEcu;
        const { serviceSid, requestHex } = buildSsm4RequestHex(sig);
        try {
          const raw = await session.sendUdsRaw(
            "can11-500",
            ecu.txHex,
            ecu.rxHex,
            requestHex,
            1100,
          );
          const parsed = parseUdsResponse(raw, serviceSid);
          if (parsed.kind === "positive") {
            const decoded = decodeSsm4SignalPayload(sig, parsed.payload);
            if (decoded) {
              const nowStr = new Date().toLocaleTimeString("ru-RU", {
                hour12: false,
              });
              setLiveValues((prev) => {
                const prevEntry = prev[sig.id];
                const num = decoded.numeric;
                const min =
                  num != null
                    ? prevEntry?.min != null
                      ? Math.min(prevEntry.min, num)
                      : num
                    : (prevEntry?.min ?? null);
                const max =
                  num != null
                    ? prevEntry?.max != null
                      ? Math.max(prevEntry.max, num)
                      : num
                    : (prevEntry?.max ?? null);
                return {
                  ...prev,
                  [sig.id]: {
                    text: decoded.text,
                    numeric: num,
                    min,
                    max,
                    updatedAt: nowStr,
                  },
                };
              });
              if (decoded.numeric != null) {
                pointValues[sig.id] = decoded.numeric;
              }
            }
          }
        } catch {
          /* ignore individual timeout */
        }
      }

      if (Object.keys(pointValues).length > 0) {
        setSamples((prev) => {
          const next = [...prev.slice(-119), { t: elapsedMs, values: pointValues }];
          setCursorBIdx(next.length - 1);
          return next;
        });

        // Evaluate SSM4 Trigger condition
        setTrigger((prevTrig) => {
          if (!prevTrig.enabled || prevTrig.triggeredAtMs != null) return prevTrig;
          const val = pointValues[prevTrig.signalId];
          if (val == null) return prevTrig;
          const hit =
            (prevTrig.slope === "above" && val >= prevTrig.threshold) ||
            (prevTrig.slope === "below" && val <= prevTrig.threshold) ||
            (prevTrig.slope === "equal" && Math.abs(val - prevTrig.threshold) < 0.5);
          return hit ? { ...prevTrig, triggeredAtMs: elapsedMs } : prevTrig;
        });
      }
    },
    [selectedEcu, session],
  );

  const handleToggleMonitor = useCallback(async () => {
    if (pollingRef.current) {
      pollingRef.current = false;
      setPolling(false);
      return;
    }
    if (!ready || busy) return;
    const activeSignals = SSM4_SIGNALS.filter((s) =>
      selectedSignalIds.includes(s.id),
    );
    if (activeSignals.length === 0) return;

    pollingRef.current = true;
    setPolling(true);
    setBusy(true);
    setError(null);
    monitorStartRef.current = Date.now();
    try {
      while (pollingRef.current) {
        const elapsed = Date.now() - monitorStartRef.current;
        await pollSignalsOnce(activeSignals, elapsed);
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка Data Monitor");
    } finally {
      pollingRef.current = false;
      setPolling(false);
      setBusy(false);
    }
  }, [ready, busy, selectedSignalIds, pollSignalsOnce, setBusy, setError]);

  const handleExportMonitorCsv = useCallback(() => {
    if (samples.length === 0) return;
    const activeSignals = SSM4_SIGNALS.filter((s) =>
      selectedSignalIds.includes(s.id),
    );
    const header = [
      "Time_ms",
      ...activeSignals.map((s) => `"${s.shortName} (${s.unit})"`),
    ].join(",");
    const rows = samples.map((pt) =>
      [
        pt.t,
        ...activeSignals.map((s) =>
          pt.values[s.id] != null ? String(pt.values[s.id]) : "",
        ),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subaru-ssm4-datamonitor-${selectedEcu.code}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [samples, selectedSignalIds, selectedEcu.code]);

  // SSM4 Function 20: Read Customize / Personalize items + Full Config Dump
  const handleReadCustomizeItems = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next: Record<string, string> = {};
      for (const item of SSM4_CUSTOMIZE_ITEMS) {
        try {
          const raw = await session.sendUdsRaw(
            "can11-500",
            item.txHex,
            item.rxHex,
            `22 ${item.didHex}`,
            1200,
          );
          const p = parseUdsResponse(raw, 0x22);
          if (p.kind === "positive" && p.payload.length > 2) {
            next[item.id] = item.decode(p.payload.slice(2));
          } else if (p.kind === "negative") {
            next[item.id] = `NRC: ${p.nrcText ?? "не поддерживается"}`;
          } else {
            next[item.id] = "Нет ответа";
          }
        } catch {
          next[item.id] = "Ошибка чтения";
        }
      }
      setCustomizeValues(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения параметров Customize");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  const handleCaptureConfigSnapshot = useCallback(
    async (slot: "A" | "B") => {
      if (!ready || busy) return;
      setBusy(true);
      setError(null);
      setConfigProgress("Чтение всех DID Subaru (Meter · BIU · EyeSight · ABS · EPS)…");
      try {
        const dump = await session.readSubaruMeterEyesightConfig(
          "can11-500",
          (msg) => setConfigProgress(msg),
        );
        if (slot === "A") setConfigDumpA(dump);
        else setConfigDumpB(dump);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка чтения конфигурации");
      } finally {
        setConfigProgress(null);
        setBusy(false);
      }
    },
    [ready, busy, session, setBusy, setError],
  );

  const handleExportDumpJson = useCallback((dump: SubaruConfigDump, slot: "A" | "B", onlyMeter = false) => {
    const payload = onlyMeter
      ? {
          ...dump,
          modules: dump.modules.filter(
            (m) => m.txHex === "783" || m.txHex === "7C0" || m.txHex === "752",
          ),
        }
      : dump;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tag = onlyMeter ? "meter-biu" : "full";
    a.download = `subaru-${tag}-config-${slot}-${dump.vin ?? "dump"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportDumpJson = useCallback(
    async (slot: "A" | "B", file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as SubaruConfigDump;
        if (!parsed || !Array.isArray(parsed.modules)) {
          throw new Error("Некорректный формат JSON-слепка Subaru");
        }
        if (slot === "A") setConfigDumpA(parsed);
        else setConfigDumpB(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки JSON-слепка");
      }
    },
    [setError],
  );
  // SSM4 Function 902: Utility / Calibration Live Inspection
  const handleReadUtilityLive = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next: Record<string, { rawHex: string; decoded: string }> = {};
      try {
        await session.sendUdsRaw(
          "can11-500",
          selectedUtility.txHex,
          selectedUtility.rxHex,
          "10 03",
          900,
        );
      } catch {
        /* ignore */
      }
      for (const item of selectedUtility.liveDids) {
        try {
          const raw = await session.sendUdsRaw(
            "can11-500",
            selectedUtility.txHex,
            selectedUtility.rxHex,
            `22 ${item.did}`,
            1200,
          );
          const p = parseUdsResponse(raw, 0x22);
          if (p.kind === "positive" && p.payload.length >= 2) {
            const hexStr = p.payload
              .slice(2)
              .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
              .join(" ");
            next[item.did] = {
              rawHex: hexStr || "—",
              decoded: formatUdsPayload(p.payload, 0x22, selectedUtility.txHex),
            };
          } else if (p.kind === "negative") {
            next[item.did] = {
              rawHex: "7F",
              decoded: p.nrcText ?? "Не поддерживается",
            };
          }
        } catch {
          /* ignore */
        }
      }
      try {
        await session.sendUdsRaw(
          "can11-500",
          selectedUtility.txHex,
          selectedUtility.rxHex,
          "10 01",
          700,
        );
      } catch {
        /* ignore */
      }
      setUtilityLiveDids(next);

      if (selectedUtility.id === "util-tpms-inspection") {
        const tpms = await session.readTpmsSensors("can11-500", "subaru-752");
        setTpmsSensors(tpms);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка инспекции калибровок");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, selectedUtility, session, setBusy, setError]);

  const dumpDiffs = useMemo<SubaruDumpDiffItem[]>(() => {
    if (!configDumpA || !configDumpB) return [];
    return diffSubaruDumps(configDumpA, configDumpB);
  }, [configDumpA, configDumpB]);

  const sampleA = samples[cursorAIdx] ?? null;
  const sampleB = samples[cursorBIdx] ?? null;

  return (
    <div className="space-y-4">
      {/* SSM4 Header: Vehicle Selector & Safety Mode Banner */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-sky-50/80 dark:from-blue-950/35 dark:via-indigo-950/25 dark:to-slate-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                <Cpu className="h-3.5 w-3.5" />
                Subaru Select Monitor 4 (SSM4)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Безопасный режим чтения (Read-Only Gate)
              </span>
              {detectedVin && (
                <span className="rounded-full bg-white/80 dark:bg-zinc-900 px-2.5 py-0.5 font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 border border-blue-200/70 dark:border-zinc-700">
                  VIN: {detectedVin}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Структура систем <strong>Powertrain · Chassis · Body</strong>, групповые списки{" "}
              <code className="font-mono">.CT</code> Data Monitor, курсоры A/B и инспекция калибровок по архитектуре дилерского комплекса{" "}
              <code className="font-mono">Subaru SSM4</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="rounded-lg border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100"
            >
              {SSM4_VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nameRu} ({v.years})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleAutoDetectVin()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Определить по VIN
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          <span>
            Платформа: <strong>{selectedVehicle.platform}</strong>
          </span>
          <span>•</span>
          <span>
            Кузова: <code className="font-mono">{selectedVehicle.chassisCodes.join(", ")}</code>
          </span>
          <span>•</span>
          <span>Двигатели: {selectedVehicle.engines.join(" / ")}</span>
        </div>
      </div>

      {/* SSM4 Top-Level Function Navigation (mirrors GetEcuFuncList.ini) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(
          [
            {
              id: "all-dtc",
              title: "1. Все системы (All DTC)",
              sub: "Function 918 · Опрос 12 ЭБУ",
              icon: Layers,
            },
            {
              id: "ecu-diag",
              title: "2. Паспорт и Freeze Frame",
              sub: "Function 1 & 909 · Коды и стоп-кадр",
              icon: FileSearch,
            },
            {
              id: "data-monitor",
              title: "3. Data Monitor (.CT)",
              sub: "Function 2 · Графики и курсоры A/B",
              icon: Activity,
            },
            {
              id: "utilities",
              title: "4. Инспекция и калибровки",
              sub: "Function 902 · Руль, CVT, EPB, TPMS",
              icon: Wrench,
            },
            {
              id: "customize",
              title: "5. Персонализация и дампы",
              sub: "Function 20 · Чтение и сравнение A/B",
              icon: Sliders,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = topView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTopView(tab.id)}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 hover:border-blue-400"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.title}</span>
              </div>
              <span
                className={`mt-1 text-[11px] ${
                  active ? "text-blue-100" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {tab.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* System Group Filter & ECU Selector Bar (Powertrain / Chassis / Body from GetEcuGroupList.ini) */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mr-1">
              Группа систем SSM4:
            </span>
            {(["ALL", "Powertrain", "Chassis", "Body"] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedGroup === grp
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                }`}
              >
                {grp === "ALL"
                  ? "Все блоки (12)"
                  : grp === "Powertrain"
                    ? "Powertrain (Силовая установка)"
                    : grp === "Chassis"
                      ? "Chassis (Шасси / ADAS)"
                      : "Body (Кузов и салон)"}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Выбран ЭБУ: {selectedEcu.code} ({selectedEcu.txHex} → {selectedEcu.rxHex})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          {filteredEcus.map((ecu) => {
            const active = ecu.ecuId === selectedEcu.ecuId;
            const report = dtcReports.find(
              (r) => r.txHex.toUpperCase() === ecu.txHex.toUpperCase(),
            );
            return (
              <button
                key={ecu.ecuId}
                type="button"
                onClick={() => handleSelectEcu(ecu)}
                className={`flex flex-col justify-between rounded-lg border p-2 text-left transition ${
                  active
                    ? "border-blue-600 bg-blue-50/90 dark:bg-blue-950/40 ring-1 ring-blue-500"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 hover:border-blue-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-300">
                    {ecu.code} · {ecu.txHex}
                  </span>
                  {ecu.safetyCritical && (
                    <span
                      title="Блок безопасности (только чтение)"
                      className="inline-flex items-center rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300"
                    >
                      <Lock className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1">
                  {ecu.nameRu}
                </div>
                {report && (
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span
                      className={
                        !report.responded
                          ? "text-zinc-400"
                          : report.dtcs.length > 0
                            ? "font-bold text-red-600 dark:text-red-400"
                            : "font-semibold text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {!report.responded
                        ? "Нет ответа"
                        : report.dtcs.length > 0
                          ? `Ошибок: ${report.dtcs.length}`
                          : "ОК (0 DTC)"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW 1: ALL-SYSTEM DTC CHECK (SSM4 Function 918) */}
      {topView === "all-dtc" && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                All-System Diagnostic Code Check (Опрос всех систем Subaru по схеме SSM4)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Последовательное открытие диагностической сессии UDS <code className="font-mono">10 03</code>, чтение текущих и сохранённых кодов{" "}
                <code className="font-mono">19 02 FF</code> / <code className="font-mono">Mode 03</code>, чтение каталожного номера <code className="font-mono">F18E</code> и безопасный возврат в <code className="font-mono">10 01</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scanProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-xs font-semibold text-white"
                >
                  <Square className="h-3.5 w-3.5" />
                  Остановить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRunAllDtcScan()}
                  disabled={!ready || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Опросить все блоки Subaru
                </button>
              )}
            </div>
          </div>

          {scanProgress && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
              {scanProgress}
            </div>
          )}

          {scanStatusMsg && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
              {scanStatusMsg}
            </div>
          )}

          <div className="space-y-2">
            {SSM4_ECUS.map((ecu) => {
              const rep = dtcReports.find(
                (r) => r.txHex.toUpperCase() === ecu.txHex.toUpperCase(),
              );
              return (
                <div
                  key={ecu.ecuId}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 font-mono text-xs font-bold">
                        {ecu.code} · {ecu.txHex} → {ecu.rxHex}
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {ecu.nameRu}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        ({ecu.group})
                      </span>
                      {rep?.partNumber && (
                        <span className="rounded bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 font-mono text-[11px] text-blue-700 dark:text-blue-300">
                          P/N: {rep.partNumber}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {rep ? (
                        rep.responded ? (
                          rep.dtcs.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Норма (0 ошибок)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Найдено кодов: {rep.dtcs.length}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-zinc-400">Нет ответа</span>
                        )
                      ) : (
                        <span className="text-xs text-zinc-400">Не опрошен</span>
                      )}

                      {ecu.canSafeClear ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleClearModuleDtc(
                              ecu.txHex,
                              ecu.rxHex,
                              ecu.nameRu,
                            )
                          }
                          disabled={!ready || busy || !rep?.responded}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                          Сброс DTC
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          <Lock className="h-3 w-3" />
                          Защита калибровок (Read-Only)
                        </span>
                      )}
                    </div>
                  </div>

                  {rep && rep.dtcs.length > 0 && (
                    <div className="mt-1 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                      {rep.dtcs.map((d) => (
                        <div
                          key={d.code}
                          className="flex flex-wrap items-center justify-between gap-2 rounded bg-red-50/70 dark:bg-red-950/25 px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-red-700 dark:text-red-300">
                              {d.code}
                            </span>
                            <span className="text-zinc-800 dark:text-zinc-200">
                              {d.description}
                            </span>
                          </div>
                          <span className="rounded bg-white/80 dark:bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                            {d.active
                              ? "Current (Активный)"
                              : "History / Memorized (Сохранённый)"}
                            {d.statusByte != null
                              ? ` · 0x${d.statusByte.toString(16).padStart(2, "0").toUpperCase()}`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: ECU UNIT INFO & FREEZE FRAME (SSM4 Function 1 & Function 909) */}
      {topView === "ecu-diag" && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Паспорт блока (Unit Info · Function 909) и стоп-кадр (Freeze Frame · Function 1) —{" "}
                {selectedEcu.nameRu}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Чтение каталожного номера Subaru (<code className="font-mono">F18E</code>), версии прошивки (<code className="font-mono">F189</code>), калибровки (<code className="font-mono">F182</code>), счётчика запусков (<code className="font-mono">101E</code>) и стоп-кадра.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadEcuPassportAndFreeze()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <FileSearch className="h-3.5 w-3.5" />
              Прочитать паспорт и стоп-кадр ({selectedEcu.txHex})
            </button>
          </div>

          {unitPassport ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] text-zinc-500">Каталожный номер (Part No. F18E)</div>
                <div className="mt-1 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {unitPassport.partNumber ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] text-zinc-500">ID калибровки (Calibration ID F182)</div>
                <div className="mt-1 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {unitPassport.calibrationId ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] text-zinc-500">Версия ПО / Система (F189 / F197)</div>
                <div className="mt-1 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {unitPassport.softwareVersion ?? unitPassport.systemName ?? "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500">
              Нажмите «Прочитать паспорт и стоп-кадр», чтобы опросить блок {selectedEcu.nameRu} ({selectedEcu.txHex} → {selectedEcu.rxHex}).
            </div>
          )}

          {freezeFrameSummary.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Данные стоп-кадра (Freeze Frame Data) и счётчики IG-ON
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {freezeFrameSummary.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">{item.label}</span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: SSM4 DATA MONITOR WITH .CT CUSTOM LISTS, TRIGGERS & CURSORS A/B */}
      {topView === "data-monitor" && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                SSM4 Data Monitor — {selectedEcu.nameRu} ({selectedEcu.txHex} → {selectedEcu.rxHex})
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Тематические списки сигналов <code className="font-mono">.CT</code> (из <code className="font-mono">GetCustomListInfo.ini</code>), запись графика, триггер события и измерительные курсоры A / B.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleMonitor()}
                disabled={!ready || (!polling && busy)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition ${
                  polling
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                }`}
              >
                {polling ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Стоп монитор
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Старт монитор ({selectedSignalIds.length})
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleExportMonitorCsv}
                disabled={samples.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Экспорт CSV ({samples.length})
              </button>
            </div>
          </div>

          {/* .CT Custom List Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
            <span className="text-xs font-semibold text-zinc-500 mr-1">
              Список .CT:
            </span>
            {selectedEcu.customLists.map((listName) => (
              <button
                key={listName}
                type="button"
                onClick={() => setSelectedCustomList(listName)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedCustomList === listName
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                }`}
              >
                {listName === "All Data" ? "All Data (Все)" : `${listName}.CT`}
              </button>
            ))}
          </div>

          {/* Signal Table with Checkboxes + Live Value + Min/Max */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500">
                  <th className="py-2 pr-2">Опрос</th>
                  <th className="py-2 px-2">Код SSM4</th>
                  <th className="py-2 px-2">Параметр</th>
                  <th className="py-2 px-2">Адрес / DID</th>
                  <th className="py-2 px-2 text-right">Текущее</th>
                  <th className="py-2 px-2 text-right">Ед.</th>
                  <th className="py-2 px-2 text-right">Min / Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {signalsForEcu.map((sig) => {
                  const checked = selectedSignalIds.includes(sig.id);
                  const live = liveValues[sig.id];
                  return (
                    <tr
                      key={sig.id}
                      className={
                        checked
                          ? "bg-blue-50/40 dark:bg-blue-950/20"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                      }
                    >
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSignalIds((p) => [...p, sig.id]);
                            } else {
                              setSelectedSignalIds((p) =>
                                p.filter((id) => id !== sig.id),
                              );
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-zinc-300"
                        />
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-blue-700 dark:text-blue-300">
                        {sig.shortName}
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {sig.nameRu}
                        </div>
                        <div className="text-[10px] text-zinc-400">{sig.nameEn}</div>
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] text-zinc-500">
                        {sig.protocol === "ssm-a8"
                          ? `A8 ${sig.addressOrDid}`
                          : `22 ${sig.addressOrDid}`}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {live ? live.text : "—"}
                      </td>
                      <td className="py-2 px-2 text-right text-zinc-500">
                        {sig.unit}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[11px] text-zinc-500">
                        {live && live.min != null && live.max != null
                          ? `${live.min} / ${live.max}`
                          : `${sig.min}..${sig.max}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SSM4 Trigger Condition & Cursor A/B Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Условие триггера записи (GetTriggerItem.ini)
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={trigger.enabled}
                    onChange={(e) =>
                      setTrigger((t) => ({
                        ...t,
                        enabled: e.target.checked,
                        triggeredAtMs: null,
                      }))
                    }
                  />
                  Включить триггер
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={trigger.signalId}
                  onChange={(e) =>
                    setTrigger((t) => ({ ...t, signalId: e.target.value }))
                  }
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                >
                  {SSM4_SIGNALS.filter((s) => s.ecuId === selectedEcu.ecuId).map(
                    (s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortName} — {s.nameRu}
                      </option>
                    ),
                  )}
                </select>
                <select
                  value={trigger.slope}
                  onChange={(e) =>
                    setTrigger((t) => ({
                      ...t,
                      slope: e.target.value as TriggerConfig["slope"],
                    }))
                  }
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                >
                  <option value="above">≥ (Above / Выше)</option>
                  <option value="below">≤ (Below / Ниже)</option>
                  <option value="equal">= (Equal / Равно)</option>
                </select>
                <input
                  type="number"
                  value={trigger.threshold}
                  onChange={(e) =>
                    setTrigger((t) => ({
                      ...t,
                      threshold: Number(e.target.value),
                    }))
                  }
                  className="w-24 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono"
                />
              </div>
              {trigger.triggeredAtMs != null && (
                <div className="rounded bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Триггер сработал на отметке {(trigger.triggeredAtMs / 1000).toFixed(1)} с!
                </div>
              )}
            </div>

            {/* Cursor A / Cursor B Delta Inspector (GraphSetting.ini) */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-800 dark:text-zinc-200">
                <span>Измерительные курсоры графика A / B (GraphSetting.ini)</span>
                {sampleA && sampleB && (
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    Δt = {((sampleB.t - sampleA.t) / 1000).toFixed(2)} с
                  </span>
                )}
              </div>
              {samples.length > 1 ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono font-semibold text-emerald-600">
                      Курсор A:
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={samples.length - 1}
                      value={Math.min(cursorAIdx, samples.length - 1)}
                      onChange={(e) => setCursorAIdx(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-14 text-right font-mono">
                      {sampleA ? `${(sampleA.t / 1000).toFixed(1)}с` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono font-semibold text-purple-600">
                      Курсор B:
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={samples.length - 1}
                      value={Math.min(cursorBIdx, samples.length - 1)}
                      onChange={(e) => setCursorBIdx(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-14 text-right font-mono">
                      {sampleB ? `${(sampleB.t / 1000).toFixed(1)}с` : "—"}
                    </span>
                  </div>
                  {sampleA && sampleB && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                      {selectedSignalIds.slice(0, 6).map((id) => {
                        const sig = SSM4_SIGNALS.find((s) => s.id === id);
                        if (!sig) return null;
                        const vA = sampleA.values[id];
                        const vB = sampleB.values[id];
                        const delta =
                          vA != null && vB != null
                            ? (vB - vA).toFixed(sig.decimals)
                            : "—";
                        return (
                          <div
                            key={id}
                            className="rounded bg-zinc-100 dark:bg-zinc-800/70 px-2 py-1 font-mono text-[10px]"
                          >
                            <div className="font-bold text-zinc-700 dark:text-zinc-300">
                              {sig.shortName}
                            </div>
                            <div>
                              A:{vA ?? "—"} → B:{vB ?? "—"} (Δ {delta})
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-zinc-400">
                  Запустите монитор, чтобы накопить точки для курсоров A и B.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: SSM4 UTILITIES & CALIBRATION INSPECTION (Function 902) */}
      {topView === "utilities" && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Инспекция калибровок и сервисных режимов (SSM4 Utility · FunctionId = 902)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Контроль условий и живых параметров калибровки датчика угла руля EPS, температуры обучения вариатора Lineartronic CVT, электроручника EPB, камеры EyeSight и датчиков шин TPMS.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {SSM4_UTILITIES.map((u) => {
              const active = u.id === selectedUtility.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelectedUtilityId(u.id);
                    setUtilityLiveDids({});
                  }}
                  className={`rounded-lg border p-2.5 text-left transition ${
                    active
                      ? "border-blue-600 bg-blue-50/90 dark:bg-blue-950/40"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-blue-300"
                  }`}
                >
                  <div className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    ECU {u.txHex} → {u.rxHex}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                    {u.titleRu}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {selectedUtility.ssmFunctionCode}
                </span>
                <h4 className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedUtility.titleRu}
                </h4>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {selectedUtility.purposeRu}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleReadUtilityLive()}
                disabled={!ready || busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
              >
                <Gauge className="h-3.5 w-3.5" />
                Опросить калибровочные регистры ({selectedUtility.txHex})
              </button>
            </div>

            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1.5">
              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Заводские условия выполнения в SSM4:
              </div>
              <ul className="list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                {selectedUtility.conditionsRu.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedUtility.liveDids.map((item) => {
                const val = utilityLiveDids[item.did];
                return (
                  <div
                    key={item.did}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
                  >
                    <div>
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {item.labelRu}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        UDS 22 {item.did} {val ? `· Raw: ${val.rawHex}` : ""}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300">
                      {val ? val.decoded : "—"}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedUtility.id === "util-tpms-inspection" &&
              tpmsSensors.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {tpmsSensors.map((w) => (
                    <div
                      key={w.wheel}
                      className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-3"
                    >
                      <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {w.label}
                      </div>
                      <div className="mt-1 font-mono text-base font-bold text-blue-700 dark:text-blue-300">
                        {w.pressureBar != null
                          ? `${w.pressureBar} бар (${w.pressureKpa} кПа)`
                          : "Нет данных"}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        {w.pressurePsi != null ? `${w.pressurePsi} PSI` : ""} · Raw:{" "}
                        {w.rawHex}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {selectedUtility.safetyNoteRu}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: SSM4 CUSTOMIZE / PERSONALIZE & FULL CONFIG DIFF (Function 20) */}
      {topView === "customize" && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Параметры персонализации (Customize · Function 20) и сравнение дампов A / B
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Безопасное чтение пользовательских регистров BIU (<code className="font-mono">752</code>), приборной панели (<code className="font-mono">783</code>) и камеры EyeSight (<code className="font-mono">787</code>) + полный дамп DID-битмапов.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadCustomizeItems()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <Sliders className="h-3.5 w-3.5" />
              Считать параметры Customize
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {SSM4_CUSTOMIZE_ITEMS.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{item.categoryRu}</span>
                    <span className="font-mono">
                      {item.txHex} · DID {item.didHex}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {item.nameRu}
                  </div>
                  <div className="text-[11px] text-zinc-400">{item.nameEn}</div>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-2 text-xs">
                  <span className="text-zinc-500">
                    По умолчанию: {item.defaultText}
                  </span>
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                    {customizeValues[item.id] ?? "Не прочитано"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Full Subaru DID Snapshot A / B & Diff */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Полный слепок DID-регистров Subaru и компаратор изменений (Снимок A vs Снимок B)
                </h4>
                <p className="text-xs text-zinc-500">
                  Сканирует карты поддержки <code className="font-mono">1000..D000</code> во всех блоках Subaru и показывает, какие байты изменились при переключении кнопок в салоне.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCaptureConfigSnapshot("A")}
                  disabled={!ready || busy}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Снять слепок A (Старая приборка) {configDumpA ? "✓" : ""}
                </button>
                {configDumpA && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleExportDumpJson(configDumpA, "A", true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Скачать файл приборки A (.json)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportDumpJson(configDumpA, "A", false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Полный дамп A
                    </button>
                  </>
                )}
                <label className="cursor-pointer rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:border-blue-400">
                  Загрузить A (.json)
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) =>
                      void handleImportDumpJson("A", e.target.files?.[0] ?? null)
                    }
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleCaptureConfigSnapshot("B")}
                  disabled={!ready || busy}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Снять слепок B (Новая приборка) {configDumpB ? "✓" : ""}
                </button>
                {configDumpB && (
                  <button
                    type="button"
                    onClick={() => handleExportDumpJson(configDumpB, "B", true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать файл приборки B (.json)
                  </button>
                )}
                <label className="cursor-pointer rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:border-blue-400">
                  Загрузить B (.json)
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) =>
                      void handleImportDumpJson("B", e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </div>

            {configProgress && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                {configProgress}
              </div>
            )}

            {dumpDiffs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  Обнаружено различий между Снимком A и Снимком B: {dumpDiffs.length}
                </div>
                {dumpDiffs.map((d) => (
                  <div
                    key={`${d.moduleKey}-${d.did}`}
                    className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-mono"
                  >
                    <div className="font-bold text-zinc-800 dark:text-zinc-200">
                      {d.moduleTitle} · DID {d.did} ({d.label})
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-400">
                      A: {d.beforeHex} ({d.beforeDecoded}) → B: {d.afterHex} (
                      {d.afterDecoded})
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(configDumpA || configDumpB) && (
              <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3">
                {(() => {
                  const activeDump = (configDumpB ?? configDumpA)!;
                  const codeMatch = extractAppliedModelAndOptionCodeFromDump(
                    activeDump,
                    appliedModelInput,
                    optionCodeInput,
                  );
                  return (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs space-y-1">
                      <div className="font-bold text-blue-900 dark:text-blue-200">
                        Итоговый код «12 columns» для ввода в SSM4:{" "}
                        <code className="rounded bg-blue-600/20 px-1.5 py-0.5 font-mono font-bold">
                          {codeMatch.inferredAppliedModel}
                        </code>{" "}
                        + Option Code{" "}
                        <code className="rounded bg-blue-600/20 px-1.5 py-0.5 font-mono font-bold">
                          {codeMatch.inferredOptionCode}
                        </code>{" "}
                        ({codeMatch.inferredRegion})
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
                        {codeMatch.explanationRu}
                      </div>
                    </div>
                  );
                })()}
                <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                  Прочитанные DID-регистры Приборки (783), Боди-модуля BIU (752) и Климата (7C4) из{" "}
                  {configDumpB ? "Снимка B" : "Снимка A"}:
                </div>
                {(configDumpB ?? configDumpA)!.modules
                  .filter(
                    (m) =>
                      (m.txHex === "783" ||
                        m.txHex === "7C0" ||
                        m.txHex === "752" ||
                        m.txHex === "7C4") &&
                      m.dids.length > 0,
                  )
                  .map((mod) => (
                    <div key={mod.txHex} className="space-y-1">
                      <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {mod.title} · найдено DID: {mod.dids.length}
                        {mod.partNumber ? ` · Part#: ${mod.partNumber}` : ""}
                        {mod.calId ? ` · CalID: ${mod.calId}` : ""}
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 font-mono text-[11px] space-y-1">
                        {mod.dids.map((item) => (
                          <div
                            key={item.did}
                            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-0.5"
                          >
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">
                              DID {item.did}{" "}
                              <span className="font-normal text-zinc-500">
                                ({item.label})
                              </span>
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {item.hex}{" "}
                              <span className="text-zinc-500">({item.decoded})</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* TSB 07-183-20 (MC-10182242-0001.pdf): Safe Procedure B Only — 12 Columns Calculator & Canadian Option Codes */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  TSB 07-183-20 · Только безопасный Procedure B (БЕЗ чтения/блокировки одометра!)
                </span>
                <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  Procedure A с одометром ИСКЛЮЧЁН (чтобы не залочить приборку в ------)
                </span>
              </div>
              <h4 className="mt-1.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                Калькулятор «Write ECU setting 12 columns of models» (7-значный Applied Model + 4-значный Option Code)
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Для перевода американской приборки и климата в метрику (<strong>°C, км/ч, л/100км</strong>) и активации{" "}
                <strong>Dual X-Mode</strong> используется исключительно{" "}
                <code className="font-mono font-bold">Write Control module setting information → Write ECU setting 12 columns of models</code>{" "}
                (Operation Procedure B по бюллетеню <code className="font-mono">MC-10182242-0001.pdf</code>). В этом режиме одометр родной приборки{" "}
                <strong>не затрагивается и не блокируется</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                  7-значный Applied Model (со стойки B, например BTACYRB):
                </label>
                <input
                  type="text"
                  maxLength={7}
                  value={appliedModelInput}
                  onChange={(e) => setAppliedModelInput(e.target.value.toUpperCase())}
                  placeholder="Например: BTACYRB"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 font-mono text-xs font-bold uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                  4-значный Option Code (со стойки B, например U45D → C05D):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={optionCodeInput}
                  onChange={(e) => setOptionCodeInput(e.target.value.toUpperCase())}
                  placeholder="Например: U45D"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 font-mono text-xs font-bold uppercase"
                />
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Исходный код таблички (12 columns):{" "}
                  <code className="font-mono font-bold text-blue-700 dark:text-blue-300">
                    {appliedModelAnalysis.appliedModel}-{appliedModelAnalysis.optionCode}
                  </code>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                    appliedModelAnalysis.valid
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {appliedModelAnalysis.valid ? "Формат 7 + 4 корректен" : "Введите 7 + 4 символа"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div>
                  • Платформа и год (<code className="font-mono font-bold">{appliedModelAnalysis.seriesCode}</code> /{" "}
                  <code className="font-mono font-bold">{appliedModelAnalysis.modelYearChar}</code>):{" "}
                  <strong>{appliedModelAnalysis.modelYearText}</strong>
                </div>
                <div>
                  • 6-й знак Applied Model (<code className="font-mono font-bold">{appliedModelAnalysis.gradeChar}</code>):{" "}
                  <strong>{appliedModelAnalysis.gradeDescriptionRu}</strong>
                </div>
                <div className="md:col-span-2">
                  • Первые 2 символа Option Code (<code className="font-mono font-bold">{appliedModelAnalysis.optionDestinationPrefix}</code>):{" "}
                  <strong>{appliedModelAnalysis.optionDestinationRu}</strong> · пакет опций:{" "}
                  <code className="font-mono font-bold">{appliedModelAnalysis.optionEquipmentSuffix}</code>
                </div>
              </div>

              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 space-y-1 text-emerald-950 dark:text-emerald-200">
                <div className="font-bold">
                  Готовый канадский код для «Write ECU setting 12 columns of models» (°C, км/ч, л/100км, TPMS 315 МГц):
                </div>
                <div>
                  • Вариант Канада Standard (<code className="font-mono font-bold">C0</code> — для 2.4T FA24F / Wilderness / XT / Ascent и 2.5L):{" "}
                  <code className="rounded bg-emerald-600/20 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.appliedModel}
                  </code>{" "}
                  + Option Code{" "}
                  <code className="rounded bg-emerald-600/20 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.canadianOptionCodeC0}
                  </code>
                </div>
                <div>
                  • Вариант Канада PZEV (<code className="font-mono font-bold">C5</code> — для атмосферных 2.5L / 2.0L из штатов с U5):{" "}
                  <code className="rounded bg-emerald-600/20 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.appliedModel}
                  </code>{" "}
                  + Option Code{" "}
                  <code className="rounded bg-emerald-600/20 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.canadianOptionCodeC5}
                  </code>
                </div>
                {appliedModelAnalysis.dualXModeAppliedModelSuggestion !==
                  appliedModelAnalysis.appliedModel && (
                  <div className="pt-1 text-amber-800 dark:text-amber-300">
                    • Чтобы одновременно включить двухрежимный <strong>Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)</strong>: используйте Applied Model{" "}
                    <code className="font-mono font-bold">
                      {appliedModelAnalysis.dualXModeAppliedModelSuggestion}
                    </code>{" "}
                    + Option Code{" "}
                    <code className="font-mono font-bold">
                      {appliedModelAnalysis.canadianOptionCodeC0}
                    </code>
                  </div>
                )}
              </div>
            </div>

            {/* Reference Table of Canadian Option Codes across TSB 07-183-20 models */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                Справочник канадских кодов (Applied Model + Option Code C0/C5) по бюллетеню TSB 07-183-20 (нажмите, чтобы подставить):
              </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300">
                    <tr>
                      <th className="px-2.5 py-1.5">Модель / Кузов</th>
                      <th className="px-2.5 py-1.5">Комплектация</th>
                      <th className="px-2.5 py-1.5">Applied Model</th>
                      <th className="px-2.5 py-1.5">США (USDM)</th>
                      <th className="px-2.5 py-1.5">Канада (°C, км/ч)</th>
                      <th className="px-2.5 py-1.5">Режим X-Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {SUBARU_CANADIAN_OPTION_PRESETS.map((preset) => (
                      <tr
                        key={preset.id}
                        onClick={() => {
                          setAppliedModelInput(preset.appliedModel);
                          setOptionCodeInput(preset.usOptionCodeExamples[0] ?? "U45D");
                        }}
                        className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors"
                      >
                        <td className="px-2.5 py-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                          {preset.modelSeriesRu}{" "}
                          <span className="text-zinc-400 font-normal">({preset.years})</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-zinc-700 dark:text-zinc-300">
                          <div>{preset.trimRu}</div>
                          <div className="text-[10px] text-zinc-500">{preset.featuresRu}</div>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-blue-700 dark:text-blue-300">
                          {preset.appliedModel}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-zinc-600 dark:text-zinc-400">
                          {preset.usOptionCodeExamples.join(", ")}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          {preset.canadianOptionCodeC0} / {preset.canadianOptionCodeC5}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              preset.xModeTypeRu.startsWith("Dual")
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                : "bg-zinc-200/70 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {preset.xModeTypeRu}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
