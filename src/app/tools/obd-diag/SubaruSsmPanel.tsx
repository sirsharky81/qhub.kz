import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ObdBleSession, ModuleDtcReport, SubaruRegionConfigDump } from "@/lib/obd/obd-session";
import type { SasCalibrationResult, TpmsWheelReading } from "@/lib/obd/mitsubishi-modules";
import { decodeSubaruEpsSteeringAngleDeg } from "@/lib/obd/subaru-steering-calibration";
import { SteeringCalConfirmDialog } from "./SteeringCalConfirmDialog";
import { LiveMetricCards } from "./LiveMetricCards";
import {
  diffSubaruDumps,
  formatUdsPayload,
  parseUdsResponse,
  type SubaruDidDiffEntry,
} from "@/lib/obd/uds";

function Mark({ className }: { className?: string }) {
  return <span className={`inline-block ${className ?? ""}`} aria-hidden />;
}
const Activity = Mark;
const AlertTriangle = Mark;
const CheckCircle2 = Mark;
const Cpu = Mark;
const Download = Mark;
const FileSearch = Mark;
const Gauge = Mark;
const Layers = Mark;
const Lock = Mark;
const Play = Mark;
const RefreshCw = Mark;
const ShieldCheck = Mark;
const Sliders = Mark;
const Sparkles = Mark;
const Square = Mark;
const Trash2 = Mark;
const Wrench = Mark;

async function sendUdsRaw(
  session: ObdBleSession,
  _protocol: string,
  tx: string,
  rx: string,
  request: string,
  _timeoutMs?: number,
): Promise<string> {
  const result = await session.sendUds("6", tx, rx, request, false);
  return result.raw;
}
import {
  cvtTempBand,
  decodeSubaruTemperatureBytes,
  formatSubaruTempText,
} from "@/lib/obd/subaru-decode";
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
  session: ObdBleSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  vinHint?: string | null;
}

type Ssm4TopView =
  | "all-dtc"
  | "data-monitor"
  | "steering"
  | "cvt"
  | "tpms"
  | "utilities"
  | "customize";

const SERVICE_UTILITIES = SSM4_UTILITIES.filter(
  (item) => item.id !== "util-cvt-at-inspection" && item.id !== "util-tpms-inspection",
);

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
    "eng-coolant-obd",
    "eng-rpm-obd",
    "eng-speed-obd",
    "eng-load-obd",
    "eng-tps-obd",
    "eng-iat-obd",
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
  const [configDumpA, setConfigDumpA] = useState<SubaruRegionConfigDump | null>(null);
  const [configDumpB, setConfigDumpB] = useState<SubaruRegionConfigDump | null>(null);
  const [configProgress, setConfigProgress] = useState<string | null>(null);
  const [appliedModelInput, setAppliedModelInput] = useState<string>("BTACYRB");
  const [optionCodeInput, setOptionCodeInput] = useState<string>("U45D");

  const appliedModelAnalysis = useMemo(
    () => decodeSubaruAppliedModel12Columns(appliedModelInput, optionCodeInput),
    [appliedModelInput, optionCodeInput],
  );

  // Utility / Calibration Inspection state
  const [selectedUtilityId, setSelectedUtilityId] = useState<string>(
    SERVICE_UTILITIES[0]?.id ?? SSM4_UTILITIES[0]!.id,
  );
  const [cvtReading, setCvtReading] = useState<{
    tempC: number | null;
    source: string;
    rawHex: string;
    decoded: string;
    volts: string | null;
  } | null>(null);
  const [utilityLiveDids, setUtilityLiveDids] = useState<
    Record<string, { rawHex: string; decoded: string }>
  >({});
  const [tpmsSensors, setTpmsSensors] = useState<TpmsWheelReading[]>([]);
  const [steeringLive, setSteeringLive] = useState<{
    angleDeg: number | null;
    angleText: string;
    rawHex: string;
    volts: string | null;
  } | null>(null);
  const [steeringPolling, setSteeringPolling] = useState(false);
  const [steeringCalConfirmOpen, setSteeringCalConfirmOpen] = useState(false);
  const [steeringCalResult, setSteeringCalResult] = useState<SasCalibrationResult | null>(null);
  const steeringPollRef = useRef(false);

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

  useEffect(() => {
    if (topView !== "data-monitor") return;
    requestAnimationFrame(() => {
      document.getElementById("subaru-live-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [topView]);

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

  const defaultSignalsForEcu = useCallback((ecu: Ssm4EcuDef) => {
    const ecuSigs = SSM4_SIGNALS.filter((s) => s.ecuId === ecu.ecuId);
    if (ecu.ecuId === 118) return ["tcm-atf-temp-uds", "tcm-supply-volts"];
    if (ecu.ecuId === 170) return ["biu-tpms-1", "biu-tpms-2", "biu-tpms-3", "biu-tpms-4"];
    if (ecu.ecuId === 234 && selectedVehicle.platform === "SGP") {
      const obd = ecuSigs.filter((s) => s.protocol === "obd-01");
      if (obd.length > 0) return obd.slice(0, 6).map((s) => s.id);
    }
    return ecuSigs.slice(0, 6).map((s) => s.id);
  }, [selectedVehicle.platform]);

  const handleSelectEcu = useCallback((ecu: Ssm4EcuDef) => {
    pollingRef.current = false;
    setPolling(false);
    setSelectedEcuId(ecu.ecuId);
    const defaultList = ecu.customLists[1] ?? ecu.customLists[0] ?? "All Data";
    setSelectedCustomList(defaultList);
    setSelectedSignalIds(defaultSignalsForEcu(ecu));
  }, [defaultSignalsForEcu]);

  useEffect(() => {
    const ecu = SSM4_ECUS.find((item) => item.ecuId === selectedEcuId) ?? SSM4_ECUS[0]!;
    setSelectedSignalIds(defaultSignalsForEcu(ecu));
  }, [selectedVehicleId, defaultSignalsForEcu, selectedEcuId]);

  // Auto-detect vehicle by VIN (Mode 09 02 or UDS 22 F190)
  const handleAutoDetectVin = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const info = await session.readVehicleIdentity();
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
        "6",
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
        const res = await session.clearModuleDtcsSafe("6", txHex, rxHex);
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
    try {
      const ident = await session.readVehicleIdentity();
      let swVer: string | null = null;
      let sysName: string | null = null;

      try {
        const raw97 = await sendUdsRaw(
            session,
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
        const raw89 = await sendUdsRaw(
            session,
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
        partNumber: ident.calid,
        softwareVersion: swVer,
        calibrationId: ident.calid,
        systemName: sysName ?? selectedEcu.nameEn,
        vin: ident.vin,
      });

      // Read Freeze Frame / IG Counter (DID 101E + Mode 02 on Engine)
      const ffItems: { label: string; value: string }[] = [];
      try {
        const raw101e = await sendUdsRaw(
            session,
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
          for (const row of ff.readings) {
            ffItems.push({
              label: row.label,
              value: row.unit ? `${row.value} ${row.unit}` : row.value,
            });
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
          const raw = await sendUdsRaw(
            session,
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
    setLiveValues({});
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
          const raw = await sendUdsRaw(
            session,
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
          "6",
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

  const handleExportDumpJson = useCallback((dump: SubaruRegionConfigDump, slot: "A" | "B", onlyMeter = false) => {
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
        const parsed = JSON.parse(text) as SubaruRegionConfigDump;
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
        await sendUdsRaw(
            session,
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
          const raw = await sendUdsRaw(
            session,
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
        await sendUdsRaw(
            session,
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
        const tpms = await session.readTpmsSensors("subaru-752");
        setTpmsSensors(tpms.wheels);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка инспекции калибровок");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, selectedUtility, session, setBusy, setError]);

  const readModuleDid = useCallback(
    async (txHex: string, rxHex: string, did: string) => {
      try {
        await sendUdsRaw(session, "can11-500", txHex, rxHex, "10 03", 800);
      } catch {
        /* session may already be open */
      }
      const raw = await sendUdsRaw(session, "can11-500", txHex, rxHex, `22 ${did}`, 1200);
      const parsed = parseUdsResponse(raw, 0x22);
      try {
        await sendUdsRaw(session, "can11-500", txHex, rxHex, "10 01", 600);
      } catch {
        /* ignore */
      }
      return parsed;
    },
    [session],
  );

  const handleReadCvt = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sources: { tx: string; rx: string; title: string }[] = [
        { tx: "7E1", rx: "7E9", title: "TCM / вариатор (7E1)" },
        { tx: "7A2", rx: "7AA", title: "Силовая установка (7A2)" },
      ];
      let found: {
        tempC: number | null;
        source: string;
        rawHex: string;
        decoded: string;
        volts: string | null;
      } | null = null;
      for (const src of sources) {
        try {
          const parsed = await readModuleDid(src.tx, src.rx, "103D");
          if (parsed.kind !== "positive" || parsed.payload.length < 3) continue;
          const data = parsed.payload.slice(2);
          const temp = decodeSubaruTemperatureBytes(data);
          const rawHex = data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          found = {
            tempC: temp?.celsius ?? null,
            source: src.title,
            rawHex,
            decoded: temp ? formatSubaruTempText(temp) : formatUdsPayload(parsed.payload, 0x22, src.tx),
            volts: null,
          };
          break;
        } catch {
          /* try next module */
        }
      }
      if (!found) {
        setCvtReading(null);
        setError("Блок вариатора не ответил по DID 103D (7E1 / 7A2). Проверьте зажигание и связь.");
        return;
      }
      try {
        const voltParsed = await readModuleDid("7E1", "7E9", "101B");
        if (voltParsed.kind === "positive" && voltParsed.payload.length >= 4) {
          found.volts = formatUdsPayload(voltParsed.payload, 0x22, "7E1");
        }
      } catch {
        /* optional */
      }
      setCvtReading(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения температуры CVT");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, readModuleDid, setBusy, setError]);

  const handleReadTpms = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const tpms = await session.readTpmsSensors("subaru-752");
      setTpmsSensors(tpms.wheels);
      if (tpms.wheels.every((w) => w.pressureBar == null)) {
        setError("BIU 752 не вернул давление шин. Нужны IG ON и короткая поездка, если датчики спят.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения TPMS");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  const readSteeringOnce = useCallback(async () => {
    const parsed = await readModuleDid("746", "74E", "1041");
    if (parsed.kind !== "positive" || parsed.payload.length < 4) {
      throw new Error("EPS 746 не вернул DID 1041 (угол руля)");
    }
    const data = parsed.payload.slice(2);
    const rawHex = data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const angleDeg = decodeSubaruEpsSteeringAngleDeg(data);
    const angleText = formatUdsPayload(parsed.payload, 0x22, "746");
    let volts: string | null = null;
    try {
      const v = await readModuleDid("746", "74E", "101B");
      if (v.kind === "positive") volts = formatUdsPayload(v.payload, 0x22, "746");
    } catch {
      /* optional */
    }
    return { angleDeg, angleText, rawHex, volts };
  }, [readModuleDid]);

  const executeSubaruSteeringCal = useCallback(async () => {
    setSteeringCalConfirmOpen(false);
    setBusy(true);
    setError(null);
    setSteeringCalResult(null);
    try {
      const res = await session.calibrateSubaruSteeringZero();
      setSteeringCalResult(res);
      if (!res.success) {
        setError("Калибровка VDC завершилась с ошибкой — см. шаги ниже");
      } else {
        try {
          setSteeringLive(await readSteeringOnce());
        } catch {
          /* optional refresh */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка калибровки нуля руля (VDC)");
    } finally {
      setBusy(false);
    }
  }, [session, readSteeringOnce, setBusy, setError]);

  const requestSubaruSteeringCal = useCallback(() => {
    if (!ready || busy || steeringPolling) return;
    setSteeringCalConfirmOpen(true);
  }, [ready, busy, steeringPolling]);

  const handleReadSteering = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSteeringLive(await readSteeringOnce());
    } catch (e) {
      setSteeringLive(null);
      setError(e instanceof Error ? e.message : "Ошибка чтения угла руля");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, readSteeringOnce, setBusy, setError]);

  const handleToggleSteeringPoll = useCallback(async () => {
    if (steeringPollRef.current) {
      steeringPollRef.current = false;
      setSteeringPolling(false);
      return;
    }
    if (!ready || busy) return;
    steeringPollRef.current = true;
    setSteeringPolling(true);
    setError(null);
    while (steeringPollRef.current) {
      try {
        setSteeringLive(await readSteeringOnce());
      } catch {
        /* keep last */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    setSteeringPolling(false);
  }, [ready, busy, readSteeringOnce, setError]);

  const dumpDiffs = useMemo<SubaruDidDiffEntry[]>(() => {
    if (!configDumpA || !configDumpB) return [];
    return diffSubaruDumps(configDumpA, configDumpB);
  }, [configDumpA, configDumpB]);

  const sampleA = samples[cursorAIdx] ?? null;
  const sampleB = samples[cursorBIdx] ?? null;

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      {topView === "data-monitor" ? (
        <p className="truncate text-[11px] text-gray-500">
          {selectedVehicle.nameRu} · блок {selectedEcu.code} ({selectedEcu.txHex})
        </p>
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white p-3.5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                <Cpu className="h-3.5 w-3.5" />
                Subaru · SSM4
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Read-Only Gate
              </span>
              {detectedVin ? (
                <span className="max-w-full truncate rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 font-mono text-[11px] text-gray-800">
                  VIN {detectedVin}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-gray-500">
              Ошибки, live, CVT, TPMS, угол руля и калибровки — вкладки ниже.
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-sm">
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full min-w-0 max-w-full truncate rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-900"
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
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Определить по VIN
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-500">
          <span>
            Платформа: <strong className="text-gray-700">{selectedVehicle.platform}</strong>
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="min-w-0 break-words">
            Кузова:{" "}
            <code className="font-mono text-gray-500">{selectedVehicle.chassisCodes.join(", ")}</code>
          </span>
        </div>
      </div>
      )}

      <div
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Разделы Subaru"
      >
        {(
          [
            { id: "all-dtc", title: "Ошибки", icon: Layers },
            { id: "data-monitor", title: "Live", icon: Activity },
            { id: "steering", title: "Угол руля", icon: Gauge },
            { id: "cvt", title: "CVT", icon: Gauge },
            { id: "tpms", title: "TPMS", icon: AlertTriangle },
            { id: "utilities", title: "Калибровки", icon: Wrench },
            { id: "customize", title: "Вариант", icon: Sliders },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = topView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTopView(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-gray-100 text-gray-700 hover:border-emerald-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
              {tab.title}
            </button>
          );
        })}
      </div>

      {topView === "all-dtc" && (
      <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-gray-500">Группа блоков:</span>
            {(["ALL", "Powertrain", "Chassis", "Body"] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  selectedGroup === grp
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-gray-50 text-gray-700 hover:border-emerald-400"
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
          <span className="text-[11px] font-mono text-gray-500">
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
                    ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-gray-200 bg-gray-50 hover:border-emerald-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-bold text-emerald-700">
                    {ecu.code} · {ecu.txHex}
                  </span>
                  {ecu.safetyCritical && (
                    <span
                      title="Блок безопасности (только чтение)"
                      className="inline-flex items-center rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-bold text-amber-800"
                    >
                      <Lock className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-medium text-gray-800 line-clamp-1">
                  {ecu.nameRu}
                </div>
                {report && (
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span
                      className={
                        !report.responded
                          ? "text-gray-500"
                          : report.dtcs.length > 0
                            ? "font-bold text-red-400"
                            : "font-semibold text-emerald-600"
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
      )}

      {topView === "all-dtc" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Ошибки всех систем
              </h3>
              <p className="text-xs text-gray-500">
                Опрос двигателя, вариатора, ABS, BIU, приборки и остальных блоков Subaru. Сброс ошибок доступен только на незащищённых модулях.
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Опросить все блоки Subaru
                </button>
              )}
            </div>
          </div>

          {scanProgress && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {scanProgress}
            </div>
          )}

          {scanStatusMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
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
                  className="rounded-lg border border-gray-200 p-3 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold">
                        {ecu.code} · {ecu.txHex} → {ecu.rxHex}
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        {ecu.nameRu}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        ({ecu.group})
                      </span>
                      {rep?.partNumber && (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                          P/N: {rep.partNumber}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {rep ? (
                        rep.responded ? (
                          rep.dtcs.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Норма (0 ошибок)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Найдено кодов: {rep.dtcs.length}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-500">Нет ответа</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-500">Не опрошен</span>
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
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                          Сброс DTC
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                          <Lock className="h-3 w-3" />
                          Защита калибровок (Read-Only)
                        </span>
                      )}
                    </div>
                  </div>

                  {rep && rep.dtcs.length > 0 && (
                    <div className="mt-1 space-y-1 border-t border-gray-200 pt-2">
                      {rep.dtcs.map((d) => (
                        <div
                          key={d.code}
                          className="flex flex-wrap items-center justify-between gap-2 rounded bg-red-50 px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-red-300">
                              {d.code}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-gray-800">{d.description}</div>
                              {d.remedy ? (
                                <div className="mt-1 text-[11px] leading-snug text-gray-500">
                                  <span className="font-semibold text-gray-500">Устранение: </span>
                                  {d.remedy}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-gray-500">
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

      {topView === "data-monitor" && (
        <div
          id="subaru-live-workspace"
          className="min-w-0 scroll-mt-3 space-y-2 rounded-xl border border-gray-200 bg-white p-3"
        >
          <div className="sticky top-0 z-20 -mx-3 space-y-2 border-b border-gray-200 bg-white/95 px-3 pb-3 pt-0.5 backdrop-blur-sm">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Блок для live
              </span>
              <select
                value={selectedEcuId}
                onChange={(e) => {
                  const ecu = SSM4_ECUS.find((item) => item.ecuId === Number(e.target.value));
                  if (ecu) handleSelectEcu(ecu);
                }}
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-900"
              >
                {SSM4_ECUS.map((ecu) => (
                  <option key={ecu.ecuId} value={ecu.ecuId}>
                    {ecu.code} · {ecu.txHex} — {ecu.nameRu}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleToggleMonitor()}
                disabled={!ready || (!polling && busy) || selectedSignalIds.length === 0}
                className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold text-white ${
                  polling ? "bg-amber-600 hover:bg-amber-500" : "border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-40"
                }`}
              >
                {polling ? "Стоп" : `Старт (${selectedSignalIds.length})`}
              </button>
              <button
                type="button"
                onClick={handleExportMonitorCsv}
                disabled={samples.length === 0}
                className="shrink-0 rounded-xl border border-gray-300 px-3 py-2.5 text-xs text-gray-700 disabled:opacity-40"
                title="Экспорт CSV"
              >
                CSV
              </button>
            </div>
          </div>

          {selectedSignalIds.length > 0 ? (
            <LiveMetricCards
              items={SSM4_SIGNALS.filter((s) => selectedSignalIds.includes(s.id)).map((sig) => {
                const live = liveValues[sig.id];
                const minStr =
                  live?.min != null ? String(Number(live.min.toFixed(sig.decimals))) : null;
                const maxStr =
                  live?.max != null ? String(Number(live.max.toFixed(sig.decimals))) : null;
                return {
                  id: sig.id,
                  label: `${sig.shortName} · ${sig.nameRu}`,
                  value: live?.text ?? "—",
                  unit: sig.unit,
                  minText: minStr,
                  maxText: maxStr,
                  highlight: polling,
                };
              })}
            />
          ) : (
            <p className="text-xs text-gray-500">Отметьте хотя бы один параметр в списке ниже.</p>
          )}

          <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-gray-700">
              Настройка: параметры и паспорт ({selectedSignalIds.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedEcu.customLists.map((listName) => (
                <button
                  key={listName}
                  type="button"
                  onClick={() => setSelectedCustomList(listName)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                    selectedCustomList === listName
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 text-gray-500"
                  }`}
                >
                  {listName === "All Data" ? "Все" : listName}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleReadEcuPassportAndFreeze()}
              disabled={!ready || busy}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[11px] text-gray-700 disabled:opacity-40"
            >
              <FileSearch className="h-3 w-3" />
              Паспорт блока
            </button>
            {unitPassport ? (
              <p className="mt-1 font-mono text-[10px] text-gray-500">
                P/N {unitPassport.partNumber ?? "—"} · Cal {unitPassport.calibrationId ?? "—"}
              </p>
            ) : null}
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto overflow-x-hidden">
              {signalsForEcu.map((sig) => {
                const checked = selectedSignalIds.includes(sig.id);
                return (
                  <li key={sig.id}>
                    <label className="flex min-w-0 items-start gap-2 text-xs text-gray-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSignalIds((p) => [...p, sig.id]);
                          } else {
                            setSelectedSignalIds((p) => p.filter((id) => id !== sig.id));
                          }
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-emerald-600/90">{sig.shortName}</span>{" "}
                        {sig.nameRu}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>

          <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-gray-500">
              Триггер и курсоры (расширенно)
            </summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800">
                  Триггер записи
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
                  className="rounded border border-gray-300 bg-gray-50 px-2 py-1"
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
                  className="rounded border border-gray-300 bg-gray-50 px-2 py-1"
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
                  className="w-24 rounded border border-gray-300 bg-gray-50 px-2 py-1 font-mono"
                />
              </div>
              {trigger.triggeredAtMs != null && (
                <div className="rounded bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Триггер сработал на отметке {(trigger.triggeredAtMs / 1000).toFixed(1)} с!
                </div>
              )}
            </div>

            {/* Cursor A / Cursor B Delta Inspector (GraphSetting.ini) */}
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                <span>Курсоры графика A / B</span>
                {sampleA && sampleB && (
                  <span className="font-mono text-emerald-600">
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
                            className="rounded bg-gray-100/70 px-2 py-1 font-mono text-[10px]"
                          >
                            <div className="font-bold text-gray-700">
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
                <div className="text-xs text-gray-500">
                  Запустите монитор, чтобы накопить точки для курсоров A и B.
                </div>
              )}
            </div>
          </div>
          </details>
        </div>
      )}

      {topView === "steering" && (
        <div className="relative space-y-3">
          <SteeringCalConfirmDialog
            brand="subaru"
            open={steeringCalConfirmOpen}
            onCancel={() => setSteeringCalConfirmOpen(false)}
            onConfirm={() => void executeSubaruSteeringCal()}
          />
          <div className="rounded-xl border border-emerald-300 bg-white p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-emerald-700">
                  Угол поворота руля Subaru (EPS 746 · DID 1041)
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Live UDS <strong>22 1041</strong> на <strong>746 → 74E</strong>. После сход-развала — калибровка
                  нуля на <strong>7B0 → 7B8</strong> (VDC Sensor Midpoint, как в SSM).
                </p>
              </div>
              <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                0.1°
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
              {steeringLive ? (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Текущий угол EPS</div>
                  {steeringLive.angleDeg != null ? (
                    <>
                      <div
                        className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
                          Math.abs(steeringLive.angleDeg) <= 0.5
                            ? "text-emerald-600"
                            : Math.abs(steeringLive.angleDeg) <= 2.5
                              ? "text-amber-800"
                              : "text-rose-400"
                        }`}
                      >
                        {steeringLive.angleDeg > 0 ? "+" : ""}
                        {steeringLive.angleDeg.toFixed(1)}°
                      </div>
                      <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-emerald-400/80" />
                        <div
                          className={`absolute top-0.5 h-2 w-3 -translate-x-1/2 rounded-full transition-all ${
                            Math.abs(steeringLive.angleDeg) <= 0.5 ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                          style={{
                            left: `${Math.max(4, Math.min(96, 50 - (steeringLive.angleDeg / 15) * 45))}%`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 font-mono text-lg text-gray-800">{steeringLive.angleText}</div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-2.5 text-left font-mono text-[11px]">
                    <div>
                      <div className="font-sans text-[10px] text-gray-500">Raw</div>
                      <div className="text-gray-800">{steeringLive.rawHex}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[10px] text-gray-500">Питание EPS</div>
                      <div className="text-gray-800">{steeringLive.volts ?? "—"}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-xs text-gray-500">
                  Запустите live-опрос или однократное чтение угла.
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleToggleSteeringPoll()}
                disabled={!ready || busy}
                className={`flex-1 min-w-[140px] rounded-xl px-4 py-3 text-xs font-semibold text-white disabled:opacity-40 ${
                  steeringPolling ? "bg-amber-600 hover:bg-amber-500" : "border border-gray-900 bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {steeringPolling ? "Остановить live" : "Live опрос (0.0°)"}
              </button>
              <button
                type="button"
                onClick={() => void handleReadSteering()}
                disabled={!ready || busy || steeringPolling}
                className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-800 disabled:opacity-40"
              >
                Считать разово
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-950/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-900">
                  Калибровка нуля (VDC 7B0 → 7B8)
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-800">
                  UDS 31 01
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-700">
                Режим «VDC Sensor Midpoint»: фиксация нуля датчика угла и G-сенсора. Только при руле и колёсах строго
                по центру.
              </p>
              <button
                type="button"
                disabled={!ready || busy || steeringPolling}
                onClick={requestSubaruSteeringCal}
                className="mt-2.5 w-full rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Калибровка нуля (0.0°)
              </button>
              {steeringCalResult ? (
                <div
                  className={`mt-2.5 rounded-lg border p-2.5 text-xs ${
                    steeringCalResult.success
                      ? "border-emerald-500/50 bg-emerald-50 text-emerald-800"
                      : "border-rose-500/50 bg-rose-950/30 text-rose-200"
                  }`}
                >
                  <div className="font-semibold">
                    {steeringCalResult.success ? "Калибровка выполнена" : "Ошибка калибровки"}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-gray-700">
                    {steeringCalResult.steps.map((s, idx) => (
                      <li key={idx}>• {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {topView === "cvt" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Температура жидкости вариатора Lineartronic
              </h3>
              <p className="text-xs text-gray-500">
                Чтение CVTF с блока коробки TCM 7E1 (DID 103D). Если TCM молчит — запасной опрос силовой установки 7A2.
                35–45 °C — проверка уровня масла, 65–85 °C — окно адаптации.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadCvt()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <Gauge className="h-3.5 w-3.5" />
              Считать температуру CVT
            </button>
          </div>

          {cvtReading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-2">
                <div className="text-xs text-gray-500">CVTF · {cvtReading.source}</div>
                <div className="mt-1 font-mono text-4xl font-bold text-emerald-700">
                  {cvtReading.tempC != null ? `${cvtReading.tempC} °C` : "—"}
                </div>
                {cvtReading.tempC != null && (
                  <div className="mt-2 text-sm font-semibold text-gray-800">
                    {cvtTempBand(cvtReading.tempC).labelRu}
                  </div>
                )}
                <div className="mt-2 font-mono text-[11px] text-gray-500">
                  Raw {cvtReading.rawHex} · {cvtReading.decoded}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Питание TCM</div>
                <div className="mt-2 text-sm font-medium text-gray-800">
                  {cvtReading.volts ?? "не прочитано"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
              Зажигание IG ON, селектор в P, двигатель желательно на холостом ходу. Нажмите «Считать температуру CVT».
            </div>
          )}
        </div>
      )}

      {topView === "tpms" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Давление в шинах (BIU / TPMS)
              </h3>
              <p className="text-xs text-gray-500">
                Прямое чтение четырёх колёс из боди-модуля 752. Показания в барах, кПа и PSI. Если датчики спят — нужна короткая поездка выше 30 км/ч.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadTpms()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <Gauge className="h-3.5 w-3.5" />
              Считать давление шин
            </button>
          </div>

          {tpmsSensors.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {tpmsSensors.slice(0, 4).map((w) => (
                <div
                  key={w.wheelIndex}
                  className="rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div className="text-xs font-bold text-gray-800">
                    {w.defaultLabel}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-emerald-700">
                    {w.pressureBar != null ? `${w.pressureBar.toFixed(2)} бар` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {w.pressureKpa != null ? `${w.pressureKpa} кПа` : "нет данных"}
                    {w.pressurePsi != null ? ` · ${w.pressurePsi} PSI` : ""}
                    {w.temperatureC != null ? ` · ${w.temperatureC} °C` : ""}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-gray-500">{w.statusText}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
              Нажмите «Считать давление шин», чтобы опросить BIU 752.
            </div>
          )}
          {tpmsSensors.length > 0 && tpmsSensors.every((w) => w.pressureBar == null) ? (
            <p className="text-[11px] text-amber-800">
              Давление не декодировалось — проверьте IG ON и поездку для пробуждения датчиков; статусы колёс см. выше.
            </p>
          ) : null}
        </div>
      )}

      {topView === "utilities" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Сервисные проверки
              </h3>
              <p className="text-xs text-gray-500">
                Угол руля EPS, электроручник EPB и камера EyeSight. Температура CVT и давление шин вынесены в отдельные вкладки.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SERVICE_UTILITIES.map((u) => {
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
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-gray-200 hover:border-emerald-400"
                  }`}
                >
                  <div className="font-mono text-[10px] font-bold text-emerald-600">
                    ECU {u.txHex} → {u.rxHex}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-gray-900 line-clamp-2">
                    {u.titleRu}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                  {selectedUtility.ssmFunctionCode}
                </span>
                <h4 className="mt-1 text-sm font-bold text-gray-900">
                  {selectedUtility.titleRu}
                </h4>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selectedUtility.purposeRu}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleReadUtilityLive()}
                disabled={!ready || busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
              >
                <Gauge className="h-3.5 w-3.5" />
                Опросить калибровочные регистры ({selectedUtility.txHex})
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
              <div className="text-xs font-bold text-gray-800">
                Заводские условия выполнения в SSM4:
              </div>
              <ul className="list-disc pl-5 text-xs text-gray-700 space-y-1">
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
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                  >
                    <div>
                      <div className="text-xs font-medium text-gray-800">
                        {item.labelRu}
                      </div>
                      <div className="font-mono text-[10px] text-gray-500">
                        UDS 22 {item.did} {val ? `· Raw: ${val.rawHex}` : ""}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-700">
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
                      key={w.wheelIndex}
                      className="rounded-lg border border-gray-200 bg-white p-3"
                    >
                      <div className="text-xs font-bold text-gray-800">
                        {w.defaultLabel}
                      </div>
                      <div className="mt-1 font-mono text-base font-bold text-emerald-700">
                        {w.pressureBar != null
                          ? `${w.pressureBar} бар (${w.pressureKpa} кПа)`
                          : "Нет данных"}
                      </div>
                      <div className="font-mono text-[10px] text-gray-500">
                        {w.pressurePsi != null ? `${w.pressurePsi} PSI` : ""} · ID:{" "}
                        {w.sensorIdHex ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            <div className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {selectedUtility.safetyNoteRu}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: SSM4 CUSTOMIZE / PERSONALIZE & FULL CONFIG DIFF (Function 20) */}
      {topView === "customize" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Конфигурация блоков и сравнение дампов
              </h3>
              <p className="text-xs text-gray-500">
                Чтение регистров BIU, приборки и EyeSight. Слепки A/B нужны, чтобы увидеть, какие байты меняются после работ в салоне.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadCustomizeItems()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <Sliders className="h-3.5 w-3.5" />
              Считать параметры Customize
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {SSM4_CUSTOMIZE_ITEMS.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 p-3 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>{item.categoryRu}</span>
                    <span className="font-mono">
                      {item.txHex} · DID {item.didHex}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-gray-900">
                    {item.nameRu}
                  </div>
                  <div className="text-[11px] text-gray-500">{item.nameEn}</div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-xs">
                  <span className="text-gray-500">
                    По умолчанию: {item.defaultText}
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    {customizeValues[item.id] ?? "Не прочитано"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Full Subaru DID Snapshot A / B & Diff */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Полный слепок DID-регистров Subaru и компаратор изменений (Снимок A vs Снимок B)
                </h4>
                <p className="text-xs text-gray-500">
                  Сканирует карты поддержки <code className="font-mono">1000..D000</code> во всех блоках Subaru и показывает, какие байты изменились при переключении кнопок в салоне.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCaptureConfigSnapshot("A")}
                  disabled={!ready || busy}
                  className="rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Снять слепок A (Старая приборка) {configDumpA ? "✓" : ""}
                </button>
                {configDumpA && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleExportDumpJson(configDumpA, "A", true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Скачать файл приборки A (.json)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportDumpJson(configDumpA, "A", false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Полный дамп A
                    </button>
                  </>
                )}
                <label className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:border-emerald-600">
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
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Снять слепок B (Новая приборка) {configDumpB ? "✓" : ""}
                </button>
                {configDumpB && (
                  <button
                    type="button"
                    onClick={() => handleExportDumpJson(configDumpB, "B", true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать файл приборки B (.json)
                  </button>
                )}
                <label className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:border-emerald-600">
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
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {configProgress}
              </div>
            )}

            {dumpDiffs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-amber-800">
                  Обнаружено различий между Снимком A и Снимком B: {dumpDiffs.length}
                </div>
                {dumpDiffs.map((d) => (
                  <div
                    key={`${d.txHex}-${d.did}`}
                    className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-mono"
                  >
                    <div className="font-bold text-gray-800">
                      {d.moduleTitle} · DID {d.did} ({d.label})
                    </div>
                    <div className="text-gray-500">
                      A: {d.beforeHex} ({d.beforeDecoded}) → B: {d.afterHex} (
                      {d.afterDecoded})
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(configDumpA || configDumpB) && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {(() => {
                  const activeDump = (configDumpB ?? configDumpA)!;
                  const codeMatch = extractAppliedModelAndOptionCodeFromDump(
                    activeDump,
                    appliedModelInput,
                    optionCodeInput,
                  );
                  return (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs space-y-1">
                      <div className="font-bold text-emerald-800">
                        Итоговый код «12 columns» для ввода в SSM4:{" "}
                        <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-800">
                          {codeMatch.inferredAppliedModel}
                        </code>{" "}
                        + Option Code{" "}
                        <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-800">
                          {codeMatch.inferredOptionCode}
                        </code>{" "}
                        ({codeMatch.inferredRegion})
                      </div>
                      <div className="text-[11px] text-gray-700">
                        {codeMatch.explanationRu}
                      </div>
                    </div>
                  );
                })()}
                <div className="text-xs font-bold text-gray-700">
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
                      <div className="text-[11px] font-semibold text-emerald-700">
                        {mod.title} · найдено DID: {mod.dids.length}
                        {mod.partNumber ? ` · Part#: ${mod.partNumber}` : ""}
                        {mod.calId ? ` · CalID: ${mod.calId}` : ""}
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] space-y-1">
                        {mod.dids.map((item) => (
                          <div
                            key={item.did}
                            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-0.5"
                          >
                            <span className="font-bold text-gray-700">
                              DID {item.did}{" "}
                              <span className="font-normal text-gray-500">
                                ({item.label})
                              </span>
                            </span>
                            <span className="text-emerald-600">
                              {item.hex}{" "}
                              <span className="text-gray-500">({item.decoded})</span>
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
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                  TSB 07-183-20 · Только безопасный Procedure B (БЕЗ чтения/блокировки одометра!)
                </span>
                <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-700">
                  Procedure A с одометром ИСКЛЮЧЁН (чтобы не залочить приборку в ------)
                </span>
              </div>
              <h4 className="mt-1.5 text-xs font-bold uppercase tracking-wider text-gray-700">
                Калькулятор «Write ECU setting 12 columns of models» (7-значный Applied Model + 4-значный Option Code)
              </h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Для перевода американской приборки и климата в метрику (<strong>°C, км/ч, л/100км</strong>) и активации{" "}
                <strong>Dual X-Mode</strong> используется исключительно{" "}
                <code className="font-mono font-bold">Write Control module setting information → Write ECU setting 12 columns of models</code>{" "}
                (Operation Procedure B по бюллетеню <code className="font-mono">MC-10182242-0001.pdf</code>). В этом режиме одометр родной приборки{" "}
                <strong>не затрагивается и не блокируется</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-700">
                  7-значный Applied Model (со стойки B, например BTACYRB):
                </label>
                <input
                  type="text"
                  maxLength={7}
                  value={appliedModelInput}
                  onChange={(e) => setAppliedModelInput(e.target.value.toUpperCase())}
                  placeholder="Например: BTACYRB"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs font-bold uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-700">
                  4-значный Option Code (со стойки B, например U45D → C05D):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={optionCodeInput}
                  onChange={(e) => setOptionCodeInput(e.target.value.toUpperCase())}
                  placeholder="Например: U45D"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs font-bold uppercase"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-700">
                  Исходный код таблички (12 columns):{" "}
                  <code className="font-mono font-bold text-emerald-700">
                    {appliedModelAnalysis.appliedModel}-{appliedModelAnalysis.optionCode}
                  </code>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                    appliedModelAnalysis.valid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-500/15 text-amber-800"
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

              <div className="rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-2 space-y-1 text-emerald-800">
                <div className="font-bold">
                  Готовый канадский код для «Write ECU setting 12 columns of models» (°C, км/ч, л/100км, TPMS 315 МГц):
                </div>
                <div>
                  • Вариант Канада Standard (<code className="font-mono font-bold">C0</code> — для 2.4T FA24F / Wilderness / XT / Ascent и 2.5L):{" "}
                  <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.appliedModel}
                  </code>{" "}
                  + Option Code{" "}
                  <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.canadianOptionCodeC0}
                  </code>
                </div>
                <div>
                  • Вариант Канада PZEV (<code className="font-mono font-bold">C5</code> — для атмосферных 2.5L / 2.0L из штатов с U5):{" "}
                  <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.appliedModel}
                  </code>{" "}
                  + Option Code{" "}
                  <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold">
                    {appliedModelAnalysis.canadianOptionCodeC5}
                  </code>
                </div>
                {appliedModelAnalysis.dualXModeAppliedModelSuggestion !==
                  appliedModelAnalysis.appliedModel && (
                  <div className="pt-1 text-amber-800">
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
              <div className="text-xs font-bold text-gray-700">
                Справочник канадских кодов (Applied Model + Option Code C0/C5) по бюллетеню TSB 07-183-20 (нажмите, чтобы подставить):
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-2.5 py-1.5">Модель / Кузов</th>
                      <th className="px-2.5 py-1.5">Комплектация</th>
                      <th className="px-2.5 py-1.5">Applied Model</th>
                      <th className="px-2.5 py-1.5">США (USDM)</th>
                      <th className="px-2.5 py-1.5">Канада (°C, км/ч)</th>
                      <th className="px-2.5 py-1.5">Режим X-Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {SUBARU_CANADIAN_OPTION_PRESETS.map((preset) => (
                      <tr
                        key={preset.id}
                        onClick={() => {
                          setAppliedModelInput(preset.appliedModel);
                          setOptionCodeInput(preset.usOptionCodeExamples[0] ?? "U45D");
                        }}
                        className="cursor-pointer hover:bg-emerald-50 transition-colors"
                      >
                        <td className="px-2.5 py-1.5 font-semibold text-gray-800">
                          {preset.modelSeriesRu}{" "}
                          <span className="text-gray-500 font-normal">({preset.years})</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-700">
                          <div>{preset.trimRu}</div>
                          <div className="text-[10px] text-gray-500">{preset.featuresRu}</div>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                          {preset.appliedModel}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-gray-500">
                          {preset.usOptionCodeExamples.join(", ")}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                          {preset.canadianOptionCodeC0} / {preset.canadianOptionCodeC5}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              preset.xModeTypeRu.startsWith("Dual")
                                ? "bg-amber-500/15 text-amber-800"
                                : "bg-gray-100 text-gray-700"
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
