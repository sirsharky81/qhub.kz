import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ObdBleSession, ModuleDtcReport, SubaruRegionConfigDump } from "@/lib/obd/obd-session";
import type { SasCalibrationResult, TpmsWheelReading } from "@/lib/obd/mitsubishi-modules";
import {
  SUBARU_SERVICE_ACTIONS,
  decodeSubaruEpsSteeringAngleDeg,
  type SubaruServiceActionId,
  type SubaruServiceActionSpec,
} from "@/lib/obd/subaru-steering-calibration";
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
  SSM4_FULL_SYSTEMS,
  SSM4_FUNCTION_CODES,
  SSM4_SIGNALS,
  SSM4_SRP_UTILITY_CATALOG,
  SSM4_UTILITIES,
  SSM4_VEHICLES,
  SUBARU_CANADIAN_OPTION_PRESETS,
  buildSsm4RequestHex,
  decodeSsm4SignalPayload,
  decodeSubaruAppliedModel12Columns,
  extractAppliedModelAndOptionCodeFromDump,
  matchSsm4VehicleByVin,
  type Ssm4EcuDef,
  type Ssm4FunctionSubOption,
  type Ssm4Group,
  type Ssm4SignalDef,
  type Ssm4SystemEntry,
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

type Ssm4StartMode = "f1-diag" | "f2-immo" | "f3-repro" | "f4-obd" | "f5-recorder";

type Ssm4TopView =
  | "all-dtc"
  | "each-system"
  | "multi-system"
  | "data-monitor"
  | "immo"
  | "utilities"
  | "customize"
  | "steering"
  | "cvt"
  | "tpms"
  | "ssm4-db";

const SERVICE_UTILITIES = SSM4_UTILITIES;

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
  const [startMode, setStartMode] = useState<Ssm4StartMode>("f1-diag");
  const [topView, setTopView] = useState<Ssm4TopView>("all-dtc");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(SSM4_VEHICLES[1]?.id ?? SSM4_VEHICLES[0]!.id);
  const [detectedVin, setDetectedVin] = useState<string | null>(vinHint ?? null);
  const [selectedGroup, setSelectedGroup] = useState<Ssm4Group | "ALL">("ALL");
  const [selectedEcuId, setSelectedEcuId] = useState<number>(234);
  const [selectedCustomList, setSelectedCustomList] = useState<string>("Diagnosis");

  // F2 Each System & F3 Multiple System & F6 Customize states
  const [selectedSystemId, setSelectedSystemId] = useState<string>("sys-egi");
  const [eachSystemStep, setEachSystemStep] = useState<"select" | "functions">("select");
  const [systemSearchQuery, setSystemSearchQuery] = useState<string>("");
  const [multiSystemIds, setMultiSystemIds] = useState<string[]>([
    "sys-egi",
    "sys-tm",
    "sys-bc",
    "sys-tpm",
  ]);
  const [selectedCustomizeSysId, setSelectedCustomizeSysId] = useState<string>("ALL");
  const [selectedSubOptionByFunc, setSelectedSubOptionByFunc] = useState<Record<number, string>>(
    () => {
      const init: Record<number, string> = {};
      for (const fn of SSM4_FUNCTION_CODES) {
        if (fn.subOptions[0]) {
          init[fn.id] = fn.subOptions[0].subId;
        }
      }
      return init;
    },
  );

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
    "eng-rpm-obd",
    "eng-speed-obd",
    "eng-coolant-obd",
    "eng-load-obd",
    "eng-tps-obd",
    "eng-map-obd",
    "eng-stft-obd",
    "eng-battery-obd",
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
    signalId: "eng-rpm-obd",
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
    tempC: number;
    source: string;
    method: string;
    rawHex: string;
    decoded: string;
    volts: string | null;
    coolantHintC: number | null;
    noteRu: string | null;
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
  const [steeringPollRef] = useState({ current: false });

  const [pendingServiceAction, setPendingServiceAction] = useState<SubaruServiceActionSpec | null>(null);
  // User-defined custom monitor groups (persisted in localStorage)
  const [userGroups, setUserGroups] = useState<{ id: string; name: string; signalIds: string[] }[]>(
    () => [
      {
        id: "ug-main-diag",
        name: "1. Основной ДВС (Обороты, ОЖ, Смесь, Дроссель)",
        signalIds: [
          "eng-rpm-obd",
          "eng-speed-obd",
          "eng-coolant-obd",
          "eng-load-obd",
          "eng-tps-obd",
          "eng-map-obd",
          "eng-stft-obd",
          "eng-ltft-obd",
          "eng-battery-obd",
        ],
      },
      {
        id: "ug-turbo-ewg",
        name: "2. Турбо FA24F / Вестгейт EWG / Пропуски цилиндров",
        signalIds: [
          "eng-rpm-obd",
          "eng-map-obd",
          "eng-uds-ewg-learn",
          "eng-uds-ewg-target",
          "eng-uds-ewg-actual",
          "eng-uds-tcv-opening",
          "eng-uds-roughness-1",
          "eng-uds-roughness-2",
          "eng-uds-roughness-3",
          "eng-uds-roughness-4",
        ],
      },
      {
        id: "ug-cvt-awd",
        name: "3. Вариатор Lineartronic CVT + Полный привод AWD",
        signalIds: [
          "tcm-atf-temp-uds",
          "tcm-cvt-temp-10d2",
          "tcm-turbine-rpm",
          "tcm-primary-pulley-rpm",
          "tcm-secondary-pulley-rpm",
          "tcm-actual-sec-press",
          "tcm-actual-pri-press",
          "tcm-actual-line-press",
          "tcm-awd-duty",
          "tcm-awd-actual-curr",
          "tcm-at-learning",
        ],
      },
      {
        id: "ug-chassis-epb",
        name: "4. Тормоза ABS/VDC, Электроручник EPB и Руль EPS",
        signalIds: [
          "eps-steering-angle",
          "eps-steering-torque",
          "abs-brake-pressure",
          "abs-fr-wc-press",
          "abs-fl-wc-press",
          "abs-g-sensor",
          "abs-epb-force",
          "abs-epb-status",
        ],
      },
    ],
  );
  const [activeUserGroupId, setActiveUserGroupId] = useState<string>("ug-main-diag");
  const [newGroupNameInput, setNewGroupNameInput] = useState<string>("");
  const [signalSearchQuery, setSignalSearchQuery] = useState<string>("");

  // Interactive execution results for SSM4 Function Codes (1..918)
  const [functionRunResults, setFunctionRunResults] = useState<
    Record<number, { status: string; lines: string[]; ok: boolean }>
  >({});

  // F2 Immobilizer & Smart Key Registration state (750 -> 758)
  const [immoProcedure, setImmoProcedure] = useState<string>("read-key-count");
  const [immoSeedHex, setImmoSeedHex] = useState<string | null>(null);
  const [immoKeyInputHex, setImmoKeyInputHex] = useState<string>("");
  const [immoTeachingCode, setImmoTeachingCode] = useState<string>("");
  const [immoLogLines, setImmoLogLines] = useState<string[]>([]);
  const [immoStatusDids, setImmoStatusDids] = useState<
    Record<string, { rawHex: string; decoded: string }>
  >({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem("qhub.subaru.live-groups");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUserGroups(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveUserGroups = useCallback(
    (next: { id: string; name: string; signalIds: string[] }[]) => {
      setUserGroups(next);
      try {
        localStorage.setItem("qhub.subaru.live-groups", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [],
  );
  const [serviceActionResults, setServiceActionResults] = useState<
    Record<string, SasCalibrationResult>
  >({});

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
    const pick = (ids: string[]) => ids.filter((id) => ecuSigs.some((s) => s.id === id));
    if (ecu.ecuId === 118) return pick(["tcm-atf-temp-uds", "tcm-cvt-temp-10d2", "tcm-supply-volts"]);
    if (ecu.ecuId === 237) return pick(["tcm2-cvt-temp-1017", "tcm2-cvt-temp-10d2"]);
    if (ecu.ecuId === 170) return pick(["biu-tpms-1", "biu-tpms-2", "biu-tpms-3", "biu-tpms-4"]);
    if (ecu.ecuId === 234) {
      const preferred = pick([
        "eng-rpm-obd",
        "eng-speed-obd",
        "eng-coolant-obd",
        "eng-load-obd",
        "eng-tps-obd",
        "eng-map-obd",
        "eng-stft-obd",
        "eng-battery-obd",
      ]);
      if (preferred.length > 0) return preferred;
    }
    return ecuSigs.slice(0, 6).map((s) => s.id);
  }, []);

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
      const catalogTargets = SSM4_ECUS.map((ecu) => ({
        tx: Number.parseInt(ecu.txHex, 16),
        rx: Number.parseInt(ecu.rxHex, 16),
        title: `${ecu.nameRu} (${ecu.txHex} → ${ecu.rxHex})`,
        safetyCritical: ecu.safetyCritical,
        canSafeClear: ecu.canSafeClear,
        mode03Fallback: ecu.mode03Fallback,
      }));
      const allReports = await session.scanCatalogModules(
        "6",
        catalogTargets,
        (msg, partial) => {
          setScanProgress(msg);
          setDtcReports(partial);
        },
        () => stopScanRef.current,
      );
      const subaruReports = allReports;
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
    const needsUdsSession = activeSignals.some((s) => s.protocol === "uds-22");
    try {
      if (needsUdsSession) {
        try {
          await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 03", 900);
        } catch {
          /* ECU may not require 10 03 */
        }
      }
      let passCount = 0;
      while (pollingRef.current) {
        const elapsed = Date.now() - monitorStartRef.current;
        await pollSignalsOnce(activeSignals, elapsed);
        passCount += 1;
        if (needsUdsSession && passCount % 12 === 0 && pollingRef.current) {
          try {
            await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "3E 00", 600);
          } catch {
            /* ignore */
          }
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка Data Monitor");
    } finally {
      if (needsUdsSession) {
        try {
          await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 01", 600);
        } catch {
          /* ignore */
        }
      }
      pollingRef.current = false;
      setPolling(false);
      setBusy(false);
    }
  }, [ready, busy, selectedSignalIds, selectedEcu.txHex, selectedEcu.rxHex, session, pollSignalsOnce, setBusy, setError]);

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
      const res = await session.readSubaruCvtFluidTemp();
      setCvtReading({
        tempC: res.tempC,
        source: res.source,
        method: res.method,
        rawHex: res.rawHex,
        decoded: res.decoded,
        volts: res.tcmVolts,
        coolantHintC: res.coolantHintC,
        noteRu: res.noteRu,
      });
    } catch (e) {
      setCvtReading(null);
      setError(e instanceof Error ? e.message : "Ошибка чтения температуры CVT");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

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

  const executePendingServiceAction = useCallback(async () => {
    if (!pendingServiceAction) return;
    const action = pendingServiceAction;
    setPendingServiceAction(null);
    setBusy(true);
    setError(null);
    try {
      const res = await session.runSubaruServiceAction(action.id as SubaruServiceActionId);
      setServiceActionResults((prev) => ({ ...prev, [action.id]: res }));
      if (!res.success) {
        setError(`Процедура «${action.buttonLabelRu}» не подтверждена блоком — см. журнал шагов ниже`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка выполнения сервисной процедуры");
    } finally {
      setBusy(false);
    }
  }, [pendingServiceAction, session, setBusy, setError]);

  const selectedSystem = useMemo<Ssm4SystemEntry>(
    () =>
      SSM4_FULL_SYSTEMS.find((s) => s.id === selectedSystemId) ??
      SSM4_FULL_SYSTEMS[0]!,
    [selectedSystemId],
  );

  const handleSelectSystemEntry = useCallback(
    (sys: Ssm4SystemEntry, openFunctions = true) => {
      setSelectedSystemId(sys.id);
      const ecu = SSM4_ECUS.find((e) => e.ecuId === sys.ecuId);
      if (ecu) {
        handleSelectEcu(ecu);
      }
      if (openFunctions) {
        setEachSystemStep("functions");
      }
    },
    [handleSelectEcu],
  );

  const handleRunSsm4Function = useCallback(
    async (funcId: number, explicitSubId?: string) => {
      const fnDef = SSM4_FUNCTION_CODES.find((f) => f.id === funcId);
      const activeSubId =
        explicitSubId ??
        selectedSubOptionByFunc[funcId] ??
        fnDef?.subOptions[0]?.subId ??
        "";
      const subOpt = fnDef?.subOptions.find((o) => o.subId === activeSubId) ?? fnDef?.subOptions[0];

      // 1. If the chosen sub-option is linked to a concrete service calibration/reset action, open its confirmation dialog
      if (subOpt?.serviceActionId) {
        const act = SUBARU_SERVICE_ACTIONS.find((a) => a.id === subOpt.serviceActionId);
        if (act) {
          setPendingServiceAction(act);
          return;
        }
      }

      // 2. Sub-options that configure and open Live Data Monitor / Multi-System / Customize / All-DTC views
      if (funcId === 2) {
        const ecuSigs = SSM4_SIGNALS.filter((s) => s.ecuId === selectedEcu.ecuId);
        if (activeSubId === "dm-all-data") {
          setSelectedCustomList("All Data");
          setSelectedSignalIds(ecuSigs.map((s) => s.id));
        } else if (activeSubId === "dm-roughness") {
          const rough = ecuSigs.filter((s) => s.customList === "Roughness");
          setSelectedCustomList("Roughness");
          setSelectedSignalIds(rough.length > 0 ? rough.map((s) => s.id) : ecuSigs.slice(0, 8).map((s) => s.id));
        } else if (activeSubId === "dm-special-eng") {
          const spec = ecuSigs.filter((s) =>
            ["EGR & Evap", "VVT & Turbo", "AWD & Solenoids", "Start-Stop & Battery"].includes(s.customList),
          );
          setSelectedSignalIds(spec.length > 0 ? spec.map((s) => s.id) : ecuSigs.map((s) => s.id));
        }
        setTopView("data-monitor");
        return;
      }

      if (funcId === 10) {
        if (activeSubId === "mdm-select-custom") {
          setTopView("multi-system");
          return;
        }
        if (activeSubId === "mdm-powertrain") {
          setSelectedSignalIds([
            "eng-rpm-obd",
            "eng-speed-obd",
            "eng-coolant-obd",
            "eng-map-obd",
            "tcm-atf-temp-uds",
            "tcm-cvt-temp-10d2",
            "tcm-turbine-rpm",
            "tcm-primary-pulley-rpm",
            "tcm-secondary-pulley-rpm",
            "tcm-actual-sec-press",
          ]);
        } else if (activeSubId === "mdm-chassis-adas") {
          setSelectedSignalIds([
            "eps-steering-angle",
            "eps-steering-torque",
            "abs-brake-pressure",
            "abs-fr-wc-press",
            "abs-fl-wc-press",
            "abs-g-sensor",
            "abs-epb-force",
            "tcm-awd-duty",
            "tcm-awd-actual-curr",
          ]);
        } else if (activeSubId === "mdm-body-climate") {
          setSelectedSignalIds([
            "biu-tpms-1",
            "biu-tpms-2",
            "biu-tpms-3",
            "biu-tpms-4",
            "met-fuel-sub-left",
            "met-fuel-sub-right",
            "ac-in-car-temp",
            "ac-ambient-temp",
            "ac-evap-core-temp",
          ]);
        }
        setTopView("data-monitor");
        return;
      }

      if (funcId === 20 && activeSubId === "cust-open-tab") {
        setTopView("customize");
        return;
      }

      if (funcId === 918 && activeSubId === "alldtc-open-table") {
        setTopView("all-dtc");
        return;
      }
      if (funcId === 918 && activeSubId === "alldtc-full-scan") {
        setTopView("all-dtc");
        if (ready && !busy) {
          void handleRunAllDtcScan();
        }
        return;
      }

      if (!ready || busy) {
        setError("Подключите адаптер vLinker для выполнения выбранной подфункции SSM4 на автомобиле");
        return;
      }

      setBusy(true);
      setError(null);
      const lines: string[] = [];
      let ok = false;
      const subTitle = subOpt ? `${subOpt.titleRu} (${subOpt.protocolHint})` : `FunctionId = ${funcId}`;

      try {
        if (funcId === 1) {
          if (activeSubId === "dtc-clear") {
            const res = await session.clearModuleDtcsSafe("6", selectedEcu.txHex, selectedEcu.rxHex);
            ok = true;
            lines.push(res);
          } else if (activeSubId === "dtc-pending") {
            const m07 = await session.readPendingDtcs();
            ok = true;
            lines.push(`Pending DTC (Mode 07): найдено ${m07.length}`);
            for (const d of m07) lines.push(`• ${d.code}: ${d.description}`);
          } else if (activeSubId === "dtc-permanent") {
            const m0a = await session.readPermanentDtcs();
            ok = true;
            lines.push(`Permanent DTC (Mode 0A): найдено ${m0a.length}`);
            for (const d of m0a) lines.push(`• ${d.code}: ${d.description}`);
          } else if (activeSubId === "dtc-freeze-single" || activeSubId === "dtc-freeze-multi") {
            const ff = await session.readFreezeFrame();
            ok = true;
            lines.push(`Freeze Frame DTC: ${ff.dtc ?? "нет ошибок в стоп-кадре"}`);
            for (const r of ff.readings) {
              lines.push(`• ${r.label}: ${r.value} ${r.unit}`);
            }
            const r101e = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "22 101E", 1000);
            const p101e = parseUdsResponse(r101e, 0x22);
            if (p101e.kind === "positive") {
              lines.push(`IG Counter (101E): ${formatUdsPayload(p101e.payload, 0x22, selectedEcu.txHex)}`);
            }
          } else if (activeSubId === "dtc-ig-counter") {
            for (const did of ["101E", "101F"]) {
              const raw = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, `22 ${did}`, 1100);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${selectedEcu.code} (${selectedEcu.txHex}) DID ${did}: ${formatUdsPayload(p.payload, 0x22, selectedEcu.txHex)}`);
              }
            }
          } else {
            // dtc-current or dtc-history
            const mask = activeSubId === "dtc-current" ? "09" : "28";
            await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 03", 800);
            const r19 = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "19 02 FF", 1500);
            const p19 = parseUdsResponse(r19, 0x19);
            if (p19.kind === "positive") {
              ok = true;
              lines.push(`${selectedEcu.code} (${selectedEcu.txHex}) [Mask 0x${mask}]: ${formatUdsPayload(p19.payload, 0x19, selectedEcu.txHex)}`);
            }
            await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 01", 600);
          }
        } else if (funcId === 3) {
          // ACTIVE_TEST sub-selection
          const actMap: Record<string, { tx: string; rx: string; dids: string[] }> = {
            "act-111-fuel-pump": { tx: "7E0", rx: "7E8", dids: ["11DE", "10B3"] },
            "act-112-cpc1": { tx: "7E0", rx: "7E8", dids: ["10AE"] },
            "act-113-rad-fan": { tx: "7E0", rx: "7E8", dids: ["10AB", "11DC"] },
            "act-114-ac-comp": { tx: "7E0", rx: "7E8", dids: ["11DA"] },
            "act-115-wastegate": { tx: "7E0", rx: "7E8", dids: ["10AC", "10D3", "10D4"] },
            "act-116-cpc2": { tx: "7E0", rx: "7E8", dids: ["11F0"] },
            "act-118-fp-duty": { tx: "7E0", rx: "7E8", dids: ["10B3", "111E"] },
            "act-119-fixed-ign": { tx: "7E0", rx: "7E8", dids: ["F40E", "F40C"] },
            "act-120-isc": { tx: "7E0", rx: "7E8", dids: ["F40C", "1277"] },
            "act-elcm-evap": { tx: "7E0", rx: "7E8", dids: ["1272", "1273"] },
            "act-meter-speedo": { tx: "783", rx: "78B", dids: ["101B", "1062", "1007"] },
          };
          const target = actMap[activeSubId] ?? { tx: "7E0", rx: "7E8", dids: ["10B3", "10AB"] };
          await sendUdsRaw(session, "can11-500", target.tx, target.rx, "10 03", 900);
          for (const did of target.dids) {
            const raw = await sendUdsRaw(session, "can11-500", target.tx, target.rx, `22 ${did}`, 1000);
            const p = parseUdsResponse(raw, 0x22);
            if (p.kind === "positive") {
              ok = true;
              lines.push(`${target.tx} DID ${did}: ${formatUdsPayload(p.payload, 0x22, target.tx)}`);
            }
          }
          await sendUdsRaw(session, "can11-500", target.tx, target.rx, "10 01", 700);
        } else if (funcId === 4) {
          if (activeSubId === "mode-default-1001") {
            const r10 = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 01", 1000);
            const p10 = parseUdsResponse(r10, 0x10);
            if (p10.kind === "positive") {
              ok = true;
              lines.push(`${selectedEcu.txHex}: ${formatUdsPayload(p10.payload, 0x10, selectedEcu.txHex)}`);
            }
          } else if (activeSubId === "mode-extended-1003" || activeSubId === "mode-testmode-49228") {
            const r10 = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "10 03", 1000);
            const p10 = parseUdsResponse(r10, 0x10);
            if (p10.kind === "positive") {
              ok = true;
              lines.push(`${selectedEcu.txHex}: ${formatUdsPayload(p10.payload, 0x10, selectedEcu.txHex)}`);
            }
            const r3e = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, "3E 00", 800);
            if (parseUdsResponse(r3e, 0x3e).kind === "positive") {
              lines.push(`${selectedEcu.txHex}: TesterPresent 3E 00 -> 7E 00 OK`);
            }
          } else {
            // mode-ig-confirm-14
            for (const did of ["F186", "101E", "101B"]) {
              const raw = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${selectedEcu.txHex} DID ${did}: ${formatUdsPayload(p.payload, 0x22, selectedEcu.txHex)}`);
              }
            }
          }
        } else if (funcId === 6 || funcId === 16 || funcId === 19 || funcId === 908) {
          if (activeSubId === "obm-misfire-cyl") {
            await sendUdsRaw(session, "can11-500", "7E0", "7E8", "10 03", 800);
            for (const did of ["110B", "110C", "110D", "110E", "2021", "2022", "2023", "2024", "2027"]) {
              const raw = await sendUdsRaw(session, "can11-500", "7E0", "7E8", `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`7E0 DID ${did}: ${formatUdsPayload(p.payload, 0x22, "7E0")}`);
              }
            }
            await sendUdsRaw(session, "can11-500", "7E0", "7E8", "10 01", 600);
          } else {
            const rdy = await session.readReadiness();
            if (rdy) {
              ok = true;
              lines.push(`MIL (Check Engine): ${rdy.mil ? "ГОРИТ (ON)" : "Погашен (OFF)"} · Кодов DTC: ${rdy.dtcCount}`);
              for (const mLine of rdy.lines) {
                lines.push(`• ${mLine}`);
              }
            }
            const pids =
              activeSubId === "mil-clear-counters"
                ? ["0130", "0131", "014E"]
                : activeSubId === "mil-lamp-distance"
                  ? ["0101", "0121", "014D"]
                  : ["0101", "0141", "0121", "0131"];
            for (const pid of pids) {
              try {
                const raw = await sendUdsRaw(session, "can11-500", "7E0", "7E8", pid, 1000);
                const p = parseUdsResponse(raw, 0x01);
                if (p.kind === "positive") {
                  ok = true;
                  lines.push(`OBD ${pid}: ${p.payload.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}`);
                }
              } catch {
                /* ignore */
              }
            }
          }
        } else if (funcId === 7 || funcId === 907) {
          const targetsBySub: Record<string, { tx: string; rx: string; name: string; dids: string[] }[]> = {
            "wff-eyesight-aeb": [{ tx: "787", rx: "78F", name: "EyeSight Pre-Crash", dids: ["F182", "F18E", "1000", "1020", "1040"] }],
            "cancel-eyesight": [{ tx: "787", rx: "78F", name: "EyeSight Cancel", dids: ["F182", "1000", "1020", "1040"] }],
            "wff-vdc-epb": [{ tx: "7B0", rx: "7B8", name: "ABS/VDC/EPB", dids: ["1001", "1006", "1501", "200A", "200D", "2012"] }],
            "cancel-vdc-avh": [{ tx: "7B0", rx: "7B8", name: "VDC/AVH Cancel", dids: ["1001", "1006", "1501", "2012"] }],
            "wff-rab-sonar": [{ tx: "786", rx: "78E", name: "RAB Sonar", dids: ["F182", "F18E", "1000", "101B"] }],
            "cancel-iss-startstop": [{ tx: "7E1", rx: "7E9", name: "Auto Start-Stop (AS.FCLT)", dids: ["1472", "1473", "14E9", "14EA", "14F8", "1501", "1521"] }],
            "cancel-ecm-cruise": [{ tx: "7E0", rx: "7E8", name: "ECM Cruise Cancel", dids: ["101E", "F40C", "F40D"] }],
          };
          const list = targetsBySub[activeSubId] ?? [
            { tx: "787", rx: "78F", name: "EyeSight", dids: ["F182", "1000"] },
            { tx: "7B0", rx: "7B8", name: "ABS/VDC", dids: ["1001", "1006"] },
          ];
          for (const target of list) {
            await sendUdsRaw(session, "can11-500", target.tx, target.rx, "10 03", 800);
            for (const did of target.dids) {
              const raw = await sendUdsRaw(session, "can11-500", target.tx, target.rx, `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${target.name} (${target.tx}) DID ${did}: ${formatUdsPayload(p.payload, 0x22, target.tx)}`);
              }
            }
            await sendUdsRaw(session, "can11-500", target.tx, target.rx, "10 01", 600);
          }
        } else if (funcId === 17) {
          if (activeSubId === "comm-cgw-status") {
            await sendUdsRaw(session, "can11-500", "750", "758", "10 03", 800);
            for (const did of ["F18E", "104E", "1052", "1057", "1067"]) {
              const raw = await sendUdsRaw(session, "can11-500", "750", "758", `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`CGTW 750 DID ${did}: ${formatUdsPayload(p.payload, 0x22, "750")}`);
              }
            }
            await sendUdsRaw(session, "can11-500", "750", "758", "10 01", 600);
          } else {
            let alive = 0;
            for (const ecu of SSM4_ECUS) {
              const raw = await sendUdsRaw(session, "can11-500", ecu.txHex, ecu.rxHex, "10 03", 650);
              const p = parseUdsResponse(raw, 0x10);
              if (p.kind !== "empty") {
                alive += 1;
                ok = true;
                lines.push(`✓ ${ecu.code} (${ecu.txHex} → ${ecu.rxHex}): На связи (${ecu.nameRu})`);
                await sendUdsRaw(session, "can11-500", ecu.txHex, ecu.rxHex, "10 01", 500);
              } else {
                lines.push(`— ${ecu.code} (${ecu.txHex}): Нет ответа`);
              }
            }
            lines.unshift(`Проверка шины CAN завершена: ответили ${alive} из ${SSM4_ECUS.length} ЭБУ`);
          }
        } else if (funcId === 18 || funcId === 909) {
          if (activeSubId === "vinfo-vin") {
            const ident = await session.readVehicleIdentity();
            if (ident.vin) {
              ok = true;
              setDetectedVin(ident.vin);
              const matched = matchSsm4VehicleByVin(ident.vin);
              lines.push(`VIN: ${ident.vin} · Модель: ${matched?.nameRu ?? "Subaru"}`);
            }
          } else if (activeSubId === "repro-history-date") {
            for (const did of ["F198", "F199", "F18B", "F18C"]) {
              const raw = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${selectedEcu.code} (${selectedEcu.txHex}) DID ${did}: ${formatUdsPayload(p.payload, 0x22, selectedEcu.txHex)}`);
              }
            }
          } else {
            const ident = await session.readVehicleIdentity();
            if (ident.vin || ident.calid || ident.cvn) {
              ok = true;
              lines.push(`VIN: ${ident.vin ?? "—"} · CalID: ${ident.calid ?? "—"} · CVN: ${ident.cvn ?? "—"}`);
            }
            const dids =
              activeSubId === "repro-boot-sw"
                ? ["F180", "F181", "F188", "F189", "F195"]
                : ["F182", "F187", "F189", "F18E", "F190", "F197"];
            for (const did of dids) {
              const raw = await sendUdsRaw(session, "can11-500", selectedEcu.txHex, selectedEcu.rxHex, `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${selectedEcu.code} (${selectedEcu.txHex}) DID ${did}: ${formatUdsPayload(p.payload, 0x22, selectedEcu.txHex)}`);
              }
            }
          }
        } else if (funcId === 20 || funcId === 917) {
          const targetMap: Record<string, { tx: string; rx: string; dids: string[] }[]> = {
            "cust-biu-752": [{ tx: "752", rx: "75A", dids: ["101E", "101B", "1061", "1066", "106B", "106C", "107A", "2028"] }],
            "cust-meter-783": [{ tx: "783", rx: "78B", dids: ["1062", "1041", "1042", "1007", "F182", "F18E"] }],
            "cust-ac-7c4": [{ tx: "7C4", rx: "7CC", dids: ["1221", "122D", "122E", "122F", "1230", "123C", "12B0"] }],
            "cust-eyesight-787": [{ tx: "787", rx: "78F", dids: ["F182", "F18E", "1000"] }],
            "pers-dms-driver": [{ tx: "763", rx: "76B", dids: ["1025", "F18E", "F197"] }],
            "pers-key-id1-5": [{ tx: "750", rx: "758", dids: ["104E", "1057", "F18E"] }],
          };
          const list = targetMap[activeSubId] ?? [
            { tx: "752", rx: "75A", dids: ["101E", "101B"] },
            { tx: "783", rx: "78B", dids: ["1062", "1041", "1042"] },
            { tx: "787", rx: "78F", dids: ["F182"] },
          ];
          for (const t of list) {
            await sendUdsRaw(session, "can11-500", t.tx, t.rx, "10 03", 800);
            for (const did of t.dids) {
              const raw = await sendUdsRaw(session, "can11-500", t.tx, t.rx, `22 ${did}`, 900);
              const p = parseUdsResponse(raw, 0x22);
              if (p.kind === "positive") {
                ok = true;
                lines.push(`${t.tx} DID ${did}: ${formatUdsPayload(p.payload, 0x22, t.tx)}`);
              }
            }
            await sendUdsRaw(session, "can11-500", t.tx, t.rx, "10 01", 600);
          }
        } else if (funcId === 915) {
          const didsBySub: Record<string, string[]> = {
            "srs-505-temp": ["1022", "1023", "1024", "1026", "102E", "102F"],
            "srs-506-mem": ["1007", "105F", "F18E", "F197"],
            "srs-507-belts-ods": ["1044", "1045", "1047"],
          };
          const dids = didsBySub[activeSubId] ?? ["1007", "1022", "1044", "1045", "1047", "105F"];
          await sendUdsRaw(session, "can11-500", "780", "788", "10 03", 800);
          for (const did of dids) {
            const raw = await sendUdsRaw(session, "can11-500", "780", "788", `22 ${did}`, 900);
            const p = parseUdsResponse(raw, 0x22);
            if (p.kind === "positive") {
              ok = true;
              lines.push(`SRS 780 DID ${did}: ${formatUdsPayload(p.payload, 0x22, "780")}`);
            }
          }
          await sendUdsRaw(session, "can11-500", "780", "788", "10 01", 600);
        } else if (funcId === 916) {
          if (activeSubId === "obddtc-mode07") {
            const m07 = await session.readPendingDtcs();
            ok = true;
            lines.push(`Ожидающие коды (Mode 07): ${m07.length}`);
            for (const d of m07) lines.push(`• ${d.code}: ${d.description}`);
          } else if (activeSubId === "obddtc-mode0a") {
            const m0a = await session.readPermanentDtcs();
            ok = true;
            lines.push(`Постоянные коды (Mode 0A): ${m0a.length}`);
            for (const d of m0a) lines.push(`• ${d.code}: ${d.description}`);
          } else {
            const m03 = await session.readObdDtcs();
            ok = true;
            lines.push(`Подтверждённые коды (Mode 03): ${m03.length}`);
            for (const d of m03) lines.push(`• ${d.code}: ${d.description}`);
          }
        }

        if (lines.length === 0) {
          lines.push(`ЭБУ ${selectedEcu.code} (${selectedEcu.txHex}) не вернул данных по «${subTitle}». Проверьте зажигание IG ON.`);
        }
        setFunctionRunResults((prev) => ({
          ...prev,
          [funcId]: {
            status: ok ? `✓ Выполнено: ${subTitle}` : `Нет ответа: ${subTitle}`,
            lines,
            ok,
          },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка выполнения подфункции SSM4";
        setFunctionRunResults((prev) => ({
          ...prev,
          [funcId]: {
            status: `Ошибка (${subTitle}): ${msg}`,
            lines: [msg],
            ok: false,
          },
        }));
      } finally {
        setBusy(false);
      }
    },
    [
      ready,
      busy,
      session,
      selectedEcu,
      selectedSubOptionByFunc,
      handleRunAllDtcScan,
      setBusy,
      setError,
    ],
  );

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

  // F2 Immobilizer & Smart Key Registration handlers (750 -> 758)
  const handleReadImmoStatus = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    const nextDids: Record<string, { rawHex: string; decoded: string }> = {};
    try {
      await sendUdsRaw(session, "can11-500", "750", "758", "10 03", 900);
      logs.push("750→758 (SMTC/IMMB): Открыта расширенная диагностическая сессия (10 03)");

      const didList = [
        { did: "F18E", label: "Каталожный номер блока Keyless/Immo" },
        { did: "F182", label: "ID калибровки / прошивки" },
        { did: "F197", label: "Название системы" },
        { did: "104E", label: "Напряжение питания Smart Key (104E)" },
        { did: "1052", label: "АЦП реле стартера (1052)" },
        { did: "1057", label: "Статус реле стартера 1 (1057)" },
        { did: "1058", label: "Статус реле стартера 2 (1058)" },
        { did: "1059", label: "Реле блокировки стартера Starter Cut (1059)" },
        { did: "105A", label: "Реле привода ICR (105A)" },
        { did: "1067", label: "Статус DC/DC конвертера 1 (1067)" },
        { did: "101E", label: "Счётчик циклов зажигания IG (101E)" },
      ];

      for (const item of didList) {
        try {
          const raw = await sendUdsRaw(session, "can11-500", "750", "758", `22 ${item.did}`, 1000);
          const p = parseUdsResponse(raw, 0x22);
          if (p.kind === "positive" && p.payload.length >= 2) {
            const hexStr = p.payload
              .slice(2)
              .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
              .join(" ");
            const dec = formatUdsPayload(p.payload, 0x22, "750");
            nextDids[item.did] = { rawHex: hexStr || "—", decoded: dec };
            logs.push(`✓ DID ${item.did} (${item.label}): ${dec}`);
          }
        } catch {
          /* ignore */
        }
      }

      try {
        const raw19 = await sendUdsRaw(session, "can11-500", "750", "758", "19 02 FF", 1200);
        const p19 = parseUdsResponse(raw19, 0x19);
        if (p19.kind === "positive") {
          logs.push(`Коды ошибок иммобилайзера (19 02 FF): ${formatUdsPayload(p19.payload, 0x19, "750")}`);
        }
      } catch {
        /* ignore */
      }

      await sendUdsRaw(session, "can11-500", "750", "758", "10 01", 700);
      setImmoStatusDids(nextDids);
      setImmoLogLines(logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка опроса иммобилайзера 750");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  const handleRequestImmoSeed = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер не подключён");
      await elm.setCanHeader(0x750, 0x758);
      const r10 = await elm.sendPayload("1003", 1200);
      logs.push(`750→758: Сессия 10 03 → ${r10.replace(/>/g, "").trim()}`);

      for (const sub of ["2701", "2703", "2711"] as const) {
        const raw = await elm.sendPayload(sub, 2000);
        const clean = raw.replace(/>/g, "").trim();
        const p = parseUdsResponse(raw, 0x27);
        logs.push(`750→758: Запрос Seed (${sub.slice(0, 2)} ${sub.slice(2)}) → ${clean}`);
        if (p.kind === "positive" && p.payload.length >= 2) {
          const seedBytes = p.payload.slice(1);
          const seedStr = seedBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          setImmoSeedHex(seedStr);
          logs.push(`✓ Получен Seed от блока 750 (${seedBytes.length} байт): ${seedStr}`);
          break;
        } else if (p.kind === "negative") {
          logs.push(`Отказ 7F 27: ${p.nrcText ?? ""}`);
        }
      }
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса SecurityAccess Seed (27 01)");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  const handleSendImmoKeyAndProcedure = useCallback(async () => {
    if (!ready || busy) return;
    const cleanKey = immoKeyInputHex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    if (cleanKey.length < 4 || cleanKey.length % 2 !== 0) {
      setError("Введите корректный ответный Key в HEX (например, 4 или 32 hex-символа для 27 02)");
      return;
    }
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер не подключён");
      await elm.setCanHeader(0x750, 0x758);
      await elm.sendPayload("1003", 1000);
      await elm.sendPayload("3E00", 800);

      const raw27 = await elm.sendPayload(`2702${cleanKey}`, 3000);
      const p27 = parseUdsResponse(raw27, 0x27);
      logs.push(`750→758: Отправка Key (27 02 ${cleanKey}) → ${raw27.replace(/>/g, "").trim()}`);

      if (p27.kind === "positive") {
        logs.push("✓ Доступ SecurityAccess (67 02) ОТКРЫТ! Запуск выбранной процедуры иммобилайзера…");
        const procPayloads: Record<string, string[]> = {
          "read-key-count": ["22104E", "221057", "31010101"],
          "verify-smart-key": ["31010102", "22104E"],
          "register-add-key": ["31010201", "31010301"],
          "delete-lost-keys": ["31010202", "31010302"],
          "sync-ecu-immo-cgtw": ["31010401", "31010501"],
        };
        const cmds = procPayloads[immoProcedure] ?? ["22104E"];
        for (const cmd of cmds) {
          const r = await elm.sendPayload(cmd, 5000);
          logs.push(`750→758 (${immoProcedure}): ${cmd} → ${r.replace(/>/g, "").trim()}`);
        }
      } else if (p27.kind === "negative") {
        logs.push(`✗ Блок 750 отклонил Key (7F 27): ${p27.nrcText ?? "неверный ключ"}`);
      } else {
        logs.push("✗ Нет подтверждения 67 02 от блока 750");
      }
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка отправки Key (27 02)");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, immoKeyInputHex, immoProcedure, session, setBusy, setError]);

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
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
        {/* SSM4 Start Menu Strip (Screenshot 1: F1 Diagnosis, F2 Immobilizer, F3 Reprogram, F4 Generic OBDII, F5 Driving Recorder) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "f1-diag", label: "F1 Diagnosis", action: () => setTopView("all-dtc") },
                {
                  id: "f2-immo",
                  label: "F2 Immobilizer / Reg.",
                  action: () => {
                    setTopView("immo");
                  },
                },
                {
                  id: "f3-repro",
                  label: "F3 Reprogram / ROM",
                  action: () => {
                    setTopView("ssm4-db");
                    void handleRunSsm4Function(18, "repro-rom-calid");
                  },
                },
                {
                  id: "f4-obd",
                  label: "F4 Generic OBDII",
                  action: () => {
                    setTopView("ssm4-db");
                    void handleRunSsm4Function(916, "obddtc-mode03");
                  },
                },
                {
                  id: "f5-recorder",
                  label: "F5 Driving Recorder",
                  action: () => {
                    setTopView("ssm4-db");
                    void handleRunSsm4Function(7, "wff-eyesight-aeb");
                  },
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setStartMode(m.id);
                  m.action();
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  startMode === m.id
                    ? "bg-blue-700 text-white shadow-sm"
                    : "border border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-400"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-bold text-blue-900">
              SUBARU Select Monitor 4
            </span>
            {detectedVin ? (
              <span className="truncate rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900">
                VIN: {detectedVin}
              </span>
            ) : null}
          </div>
        </div>

        {/* Vehicle Selection Bar (Screenshot 2: Vehicle specifications / Legacy / Outback / 22MY / SSM4) */}
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-gray-900">
                Vehicle: <span className="text-blue-700">{selectedVehicle.division}</span>
              </span>
              <span>·</span>
              <span className="font-semibold text-gray-700">
                Model: <code className="font-mono">{selectedVehicle.modelCode}</code> ({selectedVehicle.years})
              </span>
              <span>·</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-700">
                Software: SSM4 ({selectedVehicle.platform})
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              Кузова: <code className="font-mono">{selectedVehicle.chassisCodes.join(", ")}</code> · Выбранная система:{" "}
              <strong className="text-gray-800">
                {selectedSystem.nameEn} ({selectedSystem.abbr} · {selectedSystem.txHex} → {selectedSystem.rxHex})
              </strong>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full min-w-0 truncate rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-900 sm:w-64"
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
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Авто-VIN
            </button>
          </div>
        </div>
      </div>
      )}

      {/* SSM4 Main Menu Navigation Bar (Screenshot 3: F1 All DTC, F2 Each System, F3 Multiple System, Live, Utilities, F6 Customize, etc.) */}
      <div
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Главное меню SSM4"
      >
        {(
          [
            { id: "all-dtc", title: "F1 Все ошибки (All DTC)", icon: Layers },
            { id: "each-system", title: "F2 По блокам (40 систем)", icon: Cpu },
            { id: "multi-system", title: "F3 Мульти-система", icon: Layers },
            { id: "data-monitor", title: "Live Монитор (Группы)", icon: Activity },
            { id: "immo", title: "F2 Иммобилайзер и ключи", icon: Lock },
            { id: "utilities", title: "Адаптации и калибровки (.srp)", icon: Wrench },
            { id: "customize", title: "F6 Кастомизация (Вариант)", icon: Sliders },
            { id: "steering", title: "Угол руля", icon: Gauge },
            { id: "cvt", title: "CVT Темп.", icon: Gauge },
            { id: "tpms", title: "TPMS Шины", icon: AlertTriangle },
            { id: "ssm4-db", title: "Коды функций SSM4", icon: FileSearch },
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
                  ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                  : "border-gray-200 bg-gray-100 text-gray-700 hover:border-blue-400"
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
                  ? `Все блоки (${SSM4_ECUS.length})`
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
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectEcu(ecu);
                          const sys = SSM4_FULL_SYSTEMS.find((s) => s.ecuId === ecu.ecuId);
                          if (sys) setSelectedSystemId(sys.id);
                          setEachSystemStep("functions");
                          setTopView("each-system");
                        }}
                        className="rounded-md border border-blue-600 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                      >
                        Функции блока →
                      </button>
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

      {/* VIEW F2: EACH SYSTEM (Screenshot 5: Select System -> System Function Menu with Sub-selection) */}
      {topView === "each-system" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3.5">
          {/* Breadcrumb Bar matching SSM4 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setEachSystemStep("select")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  eachSystemStep === "select"
                    ? "bg-blue-700 text-white"
                    : "border border-gray-300 bg-gray-100 text-gray-800 hover:border-blue-500"
                }`}
              >
                1. Выбор системы ({SSM4_FULL_SYSTEMS.length})
              </button>
              <span className="text-gray-400">→</span>
              <button
                type="button"
                onClick={() => setEachSystemStep("functions")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  eachSystemStep === "functions"
                    ? "bg-blue-700 text-white"
                    : "border border-gray-300 bg-gray-100 text-gray-800 hover:border-blue-500"
                }`}
              >
                2. Функции и подвыбор: {selectedSystem.nameEn} ({selectedSystem.abbr})
              </button>
            </div>
            <span className="font-mono text-[11px] font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              CAN {selectedSystem.txHex} → {selectedSystem.rxHex}
            </span>
          </div>

          {eachSystemStep === "select" ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    F2 Each System — Выберите систему автомобиля (40 систем SSM4)
                  </h3>
                  <p className="text-xs text-gray-500">
                    Нажмите на любую систему, чтобы открыть её диагностическое меню с подвыбором функций (DTC, Data Monitor, Active Test, Work Support / Utility, Customize, Unit Info).
                  </p>
                </div>
                <input
                  type="text"
                  value={systemSearchQuery}
                  onChange={(e) => setSystemSearchQuery(e.target.value)}
                  placeholder="Поиск системы (Engine, EyeSight, BIU, EPB)…"
                  className="w-full sm:w-64 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["ALL", "Powertrain", "Chassis", "Body"] as const).map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroup(grp)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      selectedGroup === grp
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 bg-gray-50 text-gray-700 hover:border-blue-400"
                    }`}
                  >
                    {grp === "ALL"
                      ? `Все системы (${SSM4_FULL_SYSTEMS.length})`
                      : grp === "Powertrain"
                        ? "Powertrain (ДВС / КПП)"
                        : grp === "Chassis"
                          ? "Chassis (Тормоза / Руль / ADAS)"
                          : "Body (Кузов / Салон / Свет)"}
                  </button>
                ))}
              </div>

              {/* 2-Column Mobile/Desktop Grid matching Screenshot 5 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {SSM4_FULL_SYSTEMS.filter((sys) => {
                  if (selectedGroup !== "ALL" && sys.group !== selectedGroup) return false;
                  const q = systemSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    sys.nameEn.toLowerCase().includes(q) ||
                    sys.nameRu.toLowerCase().includes(q) ||
                    sys.abbr.toLowerCase().includes(q) ||
                    sys.txHex.toLowerCase().includes(q)
                  );
                }).map((sys) => {
                  const active = sys.id === selectedSystem.id;
                  return (
                    <button
                      key={sys.id}
                      type="button"
                      onClick={() => handleSelectSystemEntry(sys, true)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-gray-200 bg-gray-50/80 text-gray-900 hover:border-blue-400 hover:bg-blue-50/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs truncate">
                            {sys.nameEn} ({sys.abbr})
                          </span>
                          {sys.supportsCustomize && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              Customize
                            </span>
                          )}
                        </div>
                        <div
                          className={`truncate text-[11px] ${
                            active ? "text-blue-100" : "text-gray-500"
                          }`}
                        >
                          {sys.nameRu}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-[10px]">
                        <div className={active ? "font-bold text-white" : "font-bold text-blue-700"}>
                          {sys.txHex}
                        </div>
                        <div className={active ? "text-blue-100" : "text-gray-400"}>Next →</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Step 2 inside F2 Each System: System Function Menu with Sub-selection */
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-blue-700 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {selectedSystem.abbr} · {selectedSystem.txHex} → {selectedSystem.rxHex}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {selectedSystem.nameEn} — {selectedSystem.nameRu}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Выберите нужную функцию блока ниже, укажите конкретный подрежим в списке подвыбора и нажмите «▶ Выполнить».
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEachSystemStep("select")}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                >
                  ← Сменить систему
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SSM4_FUNCTION_CODES.filter((fn) =>
                  selectedSystem.functions.includes(fn.id),
                ).map((fn) => {
                  const selectedSubId =
                    selectedSubOptionByFunc[fn.id] ?? fn.subOptions[0]?.subId ?? "";
                  const currentSub =
                    fn.subOptions.find((o) => o.subId === selectedSubId) ?? fn.subOptions[0];
                  const runRes = functionRunResults[fn.id];
                  return (
                    <div
                      key={fn.id}
                      className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-gray-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                            FunctionId = {fn.id}
                          </span>
                          <code className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-900">
                            {fn.internalName}
                          </code>
                        </div>
                        <div className="text-xs font-bold text-gray-900">{fn.titleRu}</div>
                        <p className="text-[11px] text-gray-600 leading-snug">{fn.descriptionRu}</p>
                      </div>

                      {/* Sub-selection (Подвыбор внутри функции) */}
                      <div className="space-y-2 border-t border-gray-200 pt-2.5">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-bold text-gray-800">
                            Подвыбор режима / процедуры ({fn.subOptions.length} вар.):
                          </span>
                          <select
                            value={selectedSubId}
                            onChange={(e) =>
                              setSelectedSubOptionByFunc((prev) => ({
                                ...prev,
                                [fn.id]: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-900"
                          >
                            {fn.subOptions.map((opt) => (
                              <option key={opt.subId} value={opt.subId}>
                                {opt.titleRu} [{opt.protocolHint}]
                              </option>
                            ))}
                          </select>
                        </label>

                        {currentSub && (
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-gray-500">
                            <span>EN: {currentSub.titleEn}</span>
                            <span className="rounded bg-white border border-gray-200 px-1.5 py-0.5 text-emerald-700 font-bold">
                              {currentSub.protocolHint}
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleRunSsm4Function(fn.id, selectedSubId)}
                          disabled={busy}
                          className="w-full rounded-lg border border-blue-700 bg-blue-700 hover:bg-blue-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            ▶ Запустить: {currentSub?.titleRu ?? fn.titleRu}
                          </span>
                          <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">
                            {selectedSystem.txHex}
                          </span>
                        </button>

                        {runRes && (
                          <div
                            className={`rounded-lg border p-2.5 text-[11px] ${
                              runRes.ok
                                ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                                : "border-amber-300 bg-amber-50 text-amber-950"
                            }`}
                          >
                            <div className="font-bold">{runRes.status}</div>
                            <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-800 max-h-40 overflow-y-auto">
                              {runRes.lines.map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW F3: MULTIPLE SYSTEM (Screenshot 6: Select multiple system with checkboxes + Next) */}
      {topView === "multi-system" && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                F3 Multiple System — Выбор нескольких систем для синхронной работы ({multiSystemIds.length} выбрано)
              </h3>
              <p className="text-xs text-gray-500">
                Отметьте галочками нужные блоки автомобиля (как в окне «Select multiple system» SSM4) и нажмите кнопку «Next» внизу для запуска мульти-монитора параметров или мульти-опроса ошибок.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMultiSystemIds(SSM4_FULL_SYSTEMS.map((s) => s.id))}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Выбрать все (40)
              </button>
              <button
                type="button"
                onClick={() => setMultiSystemIds([])}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Сбросить
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-96 overflow-y-auto pr-1">
            {SSM4_FULL_SYSTEMS.map((sys) => {
              const checked = multiSystemIds.includes(sys.id);
              return (
                <label
                  key={sys.id}
                  className={`cursor-pointer flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    checked
                      ? "border-blue-600 bg-blue-50/80 text-blue-950 font-semibold"
                      : "border-gray-200 bg-gray-50/50 text-gray-800 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMultiSystemIds((prev) => [...prev, sys.id]);
                        } else {
                          setMultiSystemIds((prev) => prev.filter((id) => id !== sys.id));
                        }
                      }}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold">
                        {sys.nameEn} ({sys.abbr})
                      </div>
                      <div className="truncate text-[11px] font-normal text-gray-500">
                        {sys.nameRu}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-gray-500">
                    {sys.txHex}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
            <span className="text-xs text-gray-600">
              Выбрано систем: <strong>{multiSystemIds.length}</strong>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={multiSystemIds.length === 0}
                onClick={() => {
                  const chosenEcuIds = new Set(
                    SSM4_FULL_SYSTEMS.filter((s) => multiSystemIds.includes(s.id)).map(
                      (s) => s.ecuId,
                    ),
                  );
                  const sigs: string[] = [];
                  for (const ecuId of chosenEcuIds) {
                    const ecuSigs = SSM4_SIGNALS.filter((s) => s.ecuId === ecuId).slice(0, 4);
                    for (const s of ecuSigs) sigs.push(s.id);
                  }
                  if (sigs.length > 0) setSelectedSignalIds(sigs);
                  setTopView("data-monitor");
                }}
                className="rounded-xl border border-blue-700 bg-blue-700 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                ✓ Next → Открыть Multi-System Live Монитор
              </button>
              <button
                type="button"
                disabled={multiSystemIds.length === 0}
                onClick={() => {
                  setTopView("all-dtc");
                  if (ready && !busy) {
                    void handleRunAllDtcScan();
                  }
                }}
                className="rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                ✓ Next → Проверить ошибки выбранных систем
              </button>
            </div>
          </div>
        </div>
      )}

      {topView === "data-monitor" && (
        <div
          id="subaru-live-workspace"
          className="min-w-0 scroll-mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-3.5"
        >
          <div className="sticky top-0 z-20 -mx-3.5 space-y-2.5 border-b border-gray-200 bg-white/95 px-3.5 pb-3 pt-1 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Live Монитор параметров SSM4 (Группы и конструктор .FACL / .CT)
                </h3>
                <p className="text-[11px] text-gray-500">
                  Выбирайте готовые группы параметров, создавайте свои собственные наборы или добавляйте/убирайте отдельные датчики из любого из {SSM4_ECUS.length} блоков.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleMonitor()}
                  disabled={!ready || (!polling && busy) || selectedSignalIds.length === 0}
                  className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-white ${
                    polling
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "border border-gray-900 bg-gray-900 hover:bg-gray-800 disabled:opacity-40"
                  }`}
                >
                  {polling ? "Стоп Live-опрос" : `Старт Live (${selectedSignalIds.length} парам.)`}
                </button>
                <button
                  type="button"
                  onClick={handleExportMonitorCsv}
                  disabled={samples.length === 0}
                  className="shrink-0 rounded-xl border border-gray-300 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  title="Экспорт записанного лога в CSV"
                >
                  CSV ({samples.length})
                </button>
              </div>
            </div>

            {/* User Monitor Groups Bar */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  Группы мониторинга (нажмите, чтобы вывести группу на экран):
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newGroupNameInput}
                    onChange={(e) => setNewGroupNameInput(e.target.value)}
                    placeholder="Название новой группы…"
                    className="w-44 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const title = newGroupNameInput.trim() || `Группа ${userGroups.length + 1}`;
                      const newGrp = {
                        id: `ug-${Date.now()}`,
                        name: title,
                        signalIds: [...selectedSignalIds],
                      };
                      const next = [...userGroups, newGrp];
                      saveUserGroups(next);
                      setActiveUserGroupId(newGrp.id);
                      setNewGroupNameInput("");
                    }}
                    className="rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    + Создать группу из текущих ({selectedSignalIds.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {userGroups.map((grp) => {
                  const isActive = activeUserGroupId === grp.id;
                  return (
                    <div
                      key={grp.id}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                        isActive
                          ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-900 ring-1 ring-emerald-500"
                          : "border-gray-300 bg-white text-gray-700 hover:border-emerald-400"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveUserGroupId(grp.id);
                          setSelectedSignalIds(grp.signalIds);
                        }}
                        className="text-left"
                      >
                        {grp.name}{" "}
                        <span className="font-mono text-[10px] opacity-75">
                          ({grp.signalIds.length})
                        </span>
                      </button>
                      {isActive && (
                        <button
                          type="button"
                          title="Обновить состав этой группы текущими выбранными параметрами"
                          onClick={() => {
                            const next = userGroups.map((g) =>
                              g.id === grp.id ? { ...g, signalIds: [...selectedSignalIds] } : g,
                            );
                            saveUserGroups(next);
                          }}
                          className="ml-1 rounded bg-emerald-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-300"
                        >
                          Сохр.
                        </button>
                      )}
                      {userGroups.length > 1 && (
                        <button
                          type="button"
                          title="Удалить группу"
                          onClick={() => {
                            const next = userGroups.filter((g) => g.id !== grp.id);
                            saveUserGroups(next);
                            if (isActive && next[0]) {
                              setActiveUserGroupId(next[0].id);
                              setSelectedSignalIds(next[0].signalIds);
                            }
                          }}
                          className="ml-0.5 rounded px-1 text-[11px] font-bold text-gray-400 hover:bg-rose-100 hover:text-rose-700"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Monitored Signals Strip with quick "-" removal */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-800">
                Активные параметры на экране ({selectedSignalIds.length}):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSignalIds([])}
                  disabled={selectedSignalIds.length === 0}
                  className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                >
                  Очистить все
                </button>
              </div>
            </div>
            {selectedSignalIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedSignalIds.map((id) => {
                  const sig = SSM4_SIGNALS.find((s) => s.id === id);
                  if (!sig) return null;
                  const ecu = SSM4_ECUS.find((e) => e.ecuId === sig.ecuId);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-950"
                    >
                      <span className="font-mono font-bold text-emerald-700">
                        {ecu?.code ?? sig.ecuId}:{sig.shortName}
                      </span>
                      <span className="truncate max-w-[180px]">{sig.nameRu}</span>
                      <button
                        type="button"
                        title="Убрать параметр из мониторинга"
                        onClick={() =>
                          setSelectedSignalIds((prev) => prev.filter((x) => x !== id))
                        }
                        className="ml-0.5 rounded bg-emerald-200/70 px-1.5 text-[11px] font-bold text-emerald-900 hover:bg-rose-200 hover:text-rose-900"
                      >
                        −
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Список пуст — выберите готовую группу выше или нажмите «+» на нужных параметрах ниже.
              </p>
            )}
          </div>

          {selectedSignalIds.length > 0 ? (
            <LiveMetricCards
              items={SSM4_SIGNALS.filter((s) => selectedSignalIds.includes(s.id)).map((sig) => {
                const live = liveValues[sig.id];
                const ecu = SSM4_ECUS.find((e) => e.ecuId === sig.ecuId);
                const minStr =
                  live?.min != null ? String(Number(live.min.toFixed(sig.decimals))) : null;
                const maxStr =
                  live?.max != null ? String(Number(live.max.toFixed(sig.decimals))) : null;
                return {
                  id: sig.id,
                  label: `${ecu ? `${ecu.code} · ` : ""}${sig.shortName} · ${sig.nameRu}`,
                  value: live?.text ?? "—",
                  unit: sig.unit,
                  minText: minStr,
                  maxText: maxStr,
                  highlight: polling,
                };
              })}
            />
          ) : null}

          {/* Add / Remove Signals by ECU & Factory .FACL/.CT Group */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-gray-900">
                Добавить или убавить параметры по блокам и заводским группам (.FACL / .CT)
              </div>
              <button
                type="button"
                onClick={() => void handleReadEcuPassportAndFreeze()}
                disabled={!ready || busy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              >
                <FileSearch className="h-3 w-3" />
                Паспорт блока ({selectedEcu.code})
              </button>
            </div>

            {unitPassport ? (
              <p className="font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1">
                {unitPassport.ecuCode} ({unitPassport.txHex}) · P/N: {unitPassport.partNumber ?? "—"} · CalID: {unitPassport.calibrationId ?? "—"} · SW: {unitPassport.softwareVersion ?? "—"}
              </p>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  1. Выберите ЭБУ Subaru ({SSM4_ECUS.length} блоков)
                </span>
                <select
                  value={selectedEcuId}
                  onChange={(e) => {
                    const ecu = SSM4_ECUS.find((item) => item.ecuId === Number(e.target.value));
                    if (ecu) {
                      setSelectedEcuId(ecu.ecuId);
                      setSelectedCustomList(ecu.customLists[0] ?? "All Data");
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-900"
                >
                  {SSM4_ECUS.map((ecu) => (
                    <option key={ecu.ecuId} value={ecu.ecuId}>
                      {ecu.code} · {ecu.txHex} — {ecu.nameRu} ({SSM4_SIGNALS.filter((s) => s.ecuId === ecu.ecuId).length} парам.)
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  2. Поиск параметра по названию или DID/PID
                </span>
                <input
                  type="text"
                  value={signalSearchQuery}
                  onChange={(e) => setSignalSearchQuery(e.target.value)}
                  placeholder="Например: CVTF, давление, 10D2, пропуск, вестгейт…"
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {selectedEcu.customLists.map((listName) => (
                  <button
                    key={listName}
                    type="button"
                    onClick={() => setSelectedCustomList(listName)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      selectedCustomList === listName
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 bg-white text-gray-700 hover:border-emerald-400"
                    }`}
                  >
                    {listName === "All Data" ? "Все параметры блока" : listName}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const idsToAdd = signalsForEcu.map((s) => s.id);
                    setSelectedSignalIds((prev) =>
                      Array.from(new Set([...prev, ...idsToAdd])),
                    );
                  }}
                  className="rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  + Добавить всю подгруппу ({signalsForEcu.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idsToRemove = new Set(signalsForEcu.map((s) => s.id));
                    setSelectedSignalIds((prev) =>
                      prev.filter((id) => !idsToRemove.has(id)),
                    );
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                >
                  − Убрать подгруппу
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {signalsForEcu
                .filter((sig) => {
                  const q = signalSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    sig.nameRu.toLowerCase().includes(q) ||
                    sig.nameEn.toLowerCase().includes(q) ||
                    sig.shortName.toLowerCase().includes(q) ||
                    sig.addressOrDid.toLowerCase().includes(q)
                  );
                })
                .map((sig) => {
                  const checked = selectedSignalIds.includes(sig.id);
                  return (
                    <div
                      key={sig.id}
                      onClick={() => {
                        if (checked) {
                          setSelectedSignalIds((p) => p.filter((id) => id !== sig.id));
                        } else {
                          setSelectedSignalIds((p) => [...p, sig.id]);
                        }
                      }}
                      className={`cursor-pointer flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                          : "border-gray-200 bg-white text-gray-800 hover:border-emerald-300"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-emerald-700">
                            {sig.shortName}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400">
                            {sig.addressOrDid}
                          </span>
                          {sig.unit && (
                            <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-600">
                              {sig.unit}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-gray-700">
                          {sig.nameRu}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                          checked
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {checked ? "−" : "+"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

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
                Чтение CVTF с TCM: 7E1 и 7A3, DID 1017 / 10D2, шкала A−50 (как ScanGauge / SSM).
                35–45 °C — проверка уровня масла, 65–85 °C — окно адаптации. Блок 7A2 сюда не входит.
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
                <div className="mt-1 text-[11px] text-gray-500">{cvtReading.method}</div>
                {cvtReading.coolantHintC != null ? (
                  <div className="mt-1 text-[11px] text-gray-600">
                    ОЖ (7E0 PID 0105) для сравнения: {cvtReading.coolantHintC} °C
                  </div>
                ) : null}
                {cvtReading.noteRu ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950">
                    {cvtReading.noteRu}
                  </p>
                ) : null}
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

      {/* VIEW F2 IMMOBILIZER & SMART KEY REGISTRATION (750 -> 758 · IMM-000..073 / KEY-001..016 / SMA-001..021) */}
      {topView === "immo" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-blue-700 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                  F2 Immobilizer etc. registration
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                  В QHub вход БЕЗ 6-месячного пароля SSM4
                </span>
              </div>
              <h3 className="mt-1.5 text-sm font-bold text-gray-900">
                Иммобилайзер, смарт-ключи и синхронизация блоков Subaru (CAN 750 → 758 · IMM / KEY / SMA)
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Прямая диагностика блока Smart Key / Immobilizer (750 → 758), проверка реле запуска и количества ключей, чтение криптографического <code className="font-mono">Seed (27 01)</code> и отправка ответного <code className="font-mono">Key (27 02)</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadImmoStatus()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-700 bg-blue-700 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Опросить блок иммобилайзера (750)
            </button>
          </div>

          {/* Architecture Explanation of the 3 security layers in SSM4 */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs space-y-2">
            <div className="font-bold text-blue-950">
              Как устроена защита раздела «F2 Immobilizer» в файлах программы SSM4 (`System.ini`, `FHIUtilityWebNKRU.dll`, `FHIUtilityCtrlNK.dll`):
            </div>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>
                <strong>1. 6-месячный пароль запуска в самом SSM4 (`System.ini` → `ImmobilizerSelect = 41005 / 40762 / 40763`):</strong> в десктопной программе SSM4 это программная блокировка оболочки (`FHIUtilityWebNKRU.dll`: <em>«Ключ идентификации подключения к серверу регулярно обновляется»</em>). <strong>В вашем веб-сервисе QHub этой блокировки нет</strong> — раздел открыт всегда.
              </li>
              <li>
                <strong>2. Автомобили до 2018 г. (Gen3 / Gen4, система `AS1` — `keyRegistAS1` / `GetSecurityAccessImb`):</strong> блок `750` запрашивает классический 2/4-байтовый `Seed → Key` (`UDS 27 01 / 27 02`) и <strong>Teaching Code</strong> (обучающий код с бирки ключей), а также требует наличия одного рабочего мастер-ключа в замке/у кнопки (`keyVerificationAS1`).
              </li>
              <li>
                <strong>3. Автомобили SGP 2018–2026 г. (Outback BT, Forester SK, XV GT/GU, Ascent WM — `SecurityAccess2018CY_AesKey`):</strong> блок Smart Key (`750`) и шлюз `CGW` используют <strong>128-битный AES Challenge-Response</strong> (`16-байтовый Seed`). Сама программа SSM4 не считает этот ключ локально, а отправляет полученный `Seed` на сервер Subaru через `HttpGetSecurityKey` / `HttpMacDataUpDownLoad`. Ниже вы можете <strong>считать `Seed (27 01)` с автомобиля</strong> и ввести рассчитанный дилерским калькулятором / ключным программатором ответный `Key (27 02)`.
              </li>
            </ul>
          </div>

          {/* Live Status DIDs of 750 -> 758 */}
          {Object.keys(immoStatusDids).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(immoStatusDids).map(([did, info]) => (
                <div
                  key={did}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-mono text-[11px] font-bold text-blue-800">
                      750 · DID {did}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500">
                      Raw: {info.rawHex}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs font-bold text-emerald-700">
                    {info.decoded}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* UDS 0x27 Seed-Key & Immobilizer Procedure Console */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-900">
                  Шаг 1. Выбор процедуры иммобилайзера (`FHIUtilityCtrlNK.dll`)
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-gray-700">
                  CAN 750 → 758
                </span>
              </div>

              <select
                value={immoProcedure}
                onChange={(e) => setImmoProcedure(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900"
              >
                <option value="read-key-count">
                  1. Проверка количества зарегистрированных ключей (imb_in_ReadKeyNumConfirm)
                </option>
                <option value="verify-smart-key">
                  2. Верификация смарт-ключа / транспондера в салоне (keyVerificationAS1)
                </option>
                <option value="register-add-key">
                  3. Дописать новый смарт-ключ к существующему (keyAddAS1 / keyRegistAS1)
                </option>
                <option value="delete-lost-keys">
                  4. Удалить утерянные смарт-ключи кроме активного (keyDeleteAS1)
                </option>
                <option value="sync-ecu-immo-cgtw">
                  5. Синхронизация блоков ECM ↔ Immobilizer ↔ Meter ↔ CGW (systemRegistAS1 / makeUpdateMacData)
                </option>
              </select>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-700">
                  Обучающий код бирки ключей (Teaching Code — для систем AS1 до 2018 г., опционально):
                </label>
                <input
                  type="text"
                  value={immoTeachingCode}
                  onChange={(e) => setImmoTeachingCode(e.target.value.toUpperCase())}
                  placeholder="Например: 5-значный или HEX Teaching Code"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleRequestImmoSeed()}
                disabled={!ready || busy}
                className="w-full rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                1. Запросить SecurityAccess Seed у блока 750 (`10 03` → `27 01`)
              </button>

              {immoSeedHex && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs">
                  <div className="font-bold text-emerald-900">
                    Полученный от автомобиля Seed (`67 01`):
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-emerald-800 select-all">
                    {immoSeedHex}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3.5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-950">
                    Шаг 2. Отправка ответного ключа `Key (27 02)` и запуск процедуры
                  </span>
                  <span className="rounded bg-amber-200/70 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                    UDS 27 02
                  </span>
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  Введите ответный <code className="font-mono font-bold">Key (HEX)</code>, рассчитанный по полученному выше <code className="font-mono">Seed</code> (2/4 байта для систем `AS1` или 16 байт для `SecurityAccess2018CY_AesKey`), чтобы открыть запись в блок <code className="font-mono">750</code> и выполнить выбранную процедуру.
                </p>
                <input
                  type="text"
                  value={immoKeyInputHex}
                  onChange={(e) => setImmoKeyInputHex(e.target.value.toUpperCase())}
                  placeholder="Введите ответный Key в HEX (например: A1 B2 C3 D4 …)"
                  className="w-full rounded-lg border border-amber-400 bg-white px-3 py-2 font-mono text-xs font-bold uppercase"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleSendImmoKeyAndProcedure()}
                disabled={!ready || busy || !immoKeyInputHex.trim()}
                className="w-full rounded-xl border border-blue-700 bg-blue-700 hover:bg-blue-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                2. Отправить `27 02 Key` и запустить процедуру на блоке 750
              </button>
            </div>
          </div>

          {immoLogLines.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-900 p-3 font-mono text-[11px] text-emerald-300 space-y-1 max-h-56 overflow-y-auto">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">
                Журнал обмена с блоком Иммобилайзера / Smart Key (750 → 758):
              </div>
              {immoLogLines.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {topView === "utilities" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Адаптации, калибровки и сервисные инспекции SSM4 (FunctionId = 902 · {SERVICE_UTILITIES.length} процедур)
              </h3>
              <p className="text-xs text-gray-500">
                Все найденные в базе SSM4 адаптации и калибровки по блокам: угол руля EPS/VDC, вариатор Lineartronic CVT (AT Learning, давления шкивов, насос EOP), электроручник EPB и суппорты, электронный вестгейт EWG и термостат TCV, герметичность EVAP ELCM, камера EyeSight, сонары RAB, фары SRH/ADB, камера DriverFocus DMS, климат Auto A/C, TPMS и Smart Key.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                      ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-500"
                      : "border-gray-200 hover:border-emerald-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-bold text-emerald-700">
                      ECU {u.txHex} → {u.rxHex}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-gray-500">
                      DID: {u.liveDids.length}
                    </span>
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
              <div className="flex flex-wrap items-center gap-2">
                {selectedUtility.id === "util-eps-sas-zero" && (
                  <button
                    type="button"
                    onClick={() => setTopView("steering")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900"
                  >
                    Перейти к записи нуля VDC (0x31)
                  </button>
                )}
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

            {(() => {
              const actionsForUtility = SUBARU_SERVICE_ACTIONS.filter(
                (a) => a.utilityId === selectedUtility.id,
              );
              if (actionsForUtility.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-amber-950">
                      Исполнительные команды калибровки, адаптации и сброса ({selectedUtility.txHex} → {selectedUtility.rxHex})
                    </div>
                    <span className="rounded bg-amber-200/70 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                      С подтверждением безопасности
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {actionsForUtility.map((act) => {
                      const actResult = serviceActionResults[act.id];
                      return (
                        <div
                          key={act.id}
                          className="rounded-lg border border-amber-300/80 bg-white p-3 flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-emerald-700">
                                {act.txHex} → {act.rxHex}
                              </span>
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                                {act.serviceBadge}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-gray-900">
                              {act.titleRu}
                            </div>
                            <p className="text-[11px] text-gray-600 leading-snug">
                              {act.warningRu}
                            </p>
                          </div>

                          <div className="space-y-2 pt-1">
                            <button
                              type="button"
                              disabled={!ready || busy}
                              onClick={() => setPendingServiceAction(act)}
                              className="w-full rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              {act.buttonLabelRu}
                            </button>
                            {actResult && (
                              <div
                                className={`rounded-md border p-2 text-[11px] ${
                                  actResult.success
                                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                    : "border-rose-300 bg-rose-50 text-rose-900"
                                }`}
                              >
                                <div className="font-bold">
                                  {actResult.success
                                    ? "Процедура успешно подтверждена ЭБУ"
                                    : "Блок отклонил запрос или не ответил"}
                                </div>
                                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-700">
                                  {actResult.steps.map((s, idx) => (
                                    <li key={idx}>• {s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {selectedUtility.safetyNoteRu}
            </div>
          </div>

          {pendingServiceAction && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setPendingServiceAction(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-900">
                    {pendingServiceAction.txHex} → {pendingServiceAction.rxHex} · {pendingServiceAction.serviceBadge}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-bold text-gray-900">
                  {pendingServiceAction.titleRu}
                </h2>
                <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-950 space-y-1.5">
                  <div className="font-bold">Условия безопасности перед запуском:</div>
                  <p className="leading-relaxed">{pendingServiceAction.warningRu}</p>
                  <div className="font-mono text-[10px] text-gray-600 pt-1">
                    Кандидаты UDS: {pendingServiceAction.candidatePayloads.join(", ")}
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium text-gray-900">
                  Подтверждаете выполнение процедуры «{pendingServiceAction.buttonLabelRu}»?
                </p>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPendingServiceAction(null)}
                    className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2.5 text-xs font-semibold text-gray-900 hover:bg-gray-200"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => void executePendingServiceAction()}
                    className="rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-white"
                  >
                    Да, выполнить процедуру
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Активный реестр сценариев калибровок и адаптаций SSM4 (`SUBARU/CONF/*.srp` · 472 скрипта и `FHIUtilityCtrlNK.dll`)
              </h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Каждое семейство `.srp` ниже активно: вы можете сразу запустить исполнительные процедуры (`UDS 31 01` / `22` / `2F`) или открыть соответствующую панель живого контроля регистров.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SSM4_SRP_UTILITY_CATALOG.map((mod) => {
                const modActions = SUBARU_SERVICE_ACTIONS.filter(
                  (a) => a.srpPrefix === mod.prefix,
                );
                return (
                  <div
                    key={mod.prefix}
                    className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                          {mod.prefix} · {mod.scriptCount} .srp
                        </span>
                        <span className="font-mono text-[11px] text-gray-600">
                          {mod.ecuCode} ({mod.txHex} → {mod.rxHex})
                        </span>
                      </div>
                      <div className="text-xs font-bold text-gray-900">
                        {mod.titleRu}
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-gray-700">
                        {mod.proceduresRu.map((proc, i) => (
                          <li key={i}>{proc}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2 border-t border-gray-200 pt-2.5">
                      <div className="text-[11px] font-bold text-gray-800">
                        Доступные действия по сценарию {mod.prefix}:
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {modActions.map((act) => {
                          const actResult = serviceActionResults[act.id];
                          return (
                            <div key={act.id} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={!ready || busy}
                                  onClick={() => setPendingServiceAction(act)}
                                  className="flex-1 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-1.5 text-left text-[11px] font-semibold text-white disabled:opacity-40 flex items-center justify-between gap-2"
                                >
                                  <span>▶ {act.buttonLabelRu}</span>
                                  <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">
                                    {act.txHex} · {act.serviceBadge}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUtilityId(act.utilityId);
                                    setUtilityLiveDids({});
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="shrink-0 rounded-lg border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800"
                                  title="Открыть DID-регистры этого блока сверху"
                                >
                                  Регистры DID
                                </button>
                              </div>
                              {actResult && (
                                <div
                                  className={`rounded border p-2 text-[10px] font-mono ${
                                    actResult.success
                                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                      : "border-rose-300 bg-rose-50 text-rose-900"
                                  }`}
                                >
                                  <div className="font-sans font-bold">
                                    {actResult.success
                                      ? "✓ Выполнено успешно"
                                      : "✗ Отказ или нет ответа от ЭБУ"}
                                  </div>
                                  {actResult.steps.map((s, idx) => (
                                    <div key={idx}>• {s}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {mod.prefix === "MET" && (
                          <button
                            type="button"
                            onClick={() => setTopView("customize")}
                            className="rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Открыть калькулятор 12 Columns (C0/C5) и слепки приборки →
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {mod.dllFunctions.map((fn) => (
                          <code
                            key={fn}
                            className="rounded bg-white border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-500"
                          >
                            {fn}()
                          </code>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                F6 Customize — Выбор системы кастомизации (17 систем SSM4) и конфигурация блоков
              </h3>
              <p className="text-xs text-gray-500">
                Выберите систему для кастомизации (как в окне «Customize → Select System» SSM4) или «All system», чтобы считать настраиваемые регистры, рассчитать код 12 Columns (C0/C5) и сравнить дампы A/B.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReadCustomizeItems()}
              disabled={!ready || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              <Sliders className="h-3.5 w-3.5" />
              Считать параметры Customize
            </button>
          </div>

          {/* 17-System Customize Selector matching Screenshot 7 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
              Select System (17 систем кастомизации SSM4):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCustomizeSysId("ALL")}
                className={`rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition ${
                  selectedCustomizeSysId === "ALL"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-200 bg-white text-gray-800 hover:border-blue-400"
                }`}
              >
                All system (Все системы кастомизации)
              </button>
              {SSM4_FULL_SYSTEMS.filter((s) => s.supportsCustomize).map((sys) => {
                const active = selectedCustomizeSysId === sys.id;
                return (
                  <button
                    key={sys.id}
                    type="button"
                    onClick={() => setSelectedCustomizeSysId(sys.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white font-bold"
                        : "border-gray-200 bg-white text-gray-800 hover:border-blue-400"
                    }`}
                  >
                    <span className="truncate">{sys.nameEn} ({sys.abbr})</span>
                    <span className={`font-mono text-[10px] ${active ? "text-blue-100" : "text-gray-400"}`}>
                      {sys.txHex}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {SSM4_CUSTOMIZE_ITEMS.filter((item) => {
              if (selectedCustomizeSysId === "ALL") return true;
              const sys = SSM4_FULL_SYSTEMS.find((s) => s.id === selectedCustomizeSysId);
              return sys ? item.ecuId === sys.ecuId : true;
            }).map((item) => (
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

      {topView === "ssm4-db" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Активные функции SSM4 (`FunctionId` = 1 .. 918) и полный каталог параметров по блокам
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Каждая функция SSM4 ниже активна: нажмите кнопку запуска на любой карточке `FunctionId`, чтобы выполнить её на выбранном ЭБУ (`{selectedEcu.code} · {selectedEcu.txHex}`) или открыть соответствующий рабочий режим. В таблице параметров нажимайте «+ В Live» на любом параметре.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedEcuId}
                onChange={(e) => {
                  const ecu = SSM4_ECUS.find((item) => item.ecuId === Number(e.target.value));
                  if (ecu) handleSelectEcu(ecu);
                }}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-900"
              >
                {SSM4_ECUS.map((ecu) => (
                  <option key={ecu.ecuId} value={ecu.ecuId}>
                    Целевой блок: {ecu.code} ({ecu.txHex}) — {ecu.nameRu}
                  </option>
                ))}
              </select>
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-mono text-xs font-bold text-emerald-800">
                SSM4 v28.6.0 · DB v28.00.001
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
              1. Исполняемые функции SSM4 (`FunctionId` = 1 .. 918) с внутренним подвыбором режима (`DetailId` / `SignalId` / `Keycode`)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {SSM4_FUNCTION_CODES.map((fn) => {
                const runRes = functionRunResults[fn.id];
                const selectedSubId =
                  selectedSubOptionByFunc[fn.id] ?? fn.subOptions[0]?.subId ?? "";
                const currentSub =
                  fn.subOptions.find((o) => o.subId === selectedSubId) ?? fn.subOptions[0];
                return (
                  <div
                    key={fn.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded bg-gray-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                          FunctionId = {fn.id}
                        </span>
                        <code className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-900">
                          {fn.internalName}
                        </code>
                      </div>
                      <div className="text-xs font-bold text-gray-900">
                        {fn.titleRu}
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug">
                        {fn.descriptionRu}
                      </p>
                    </div>

                    <div className="space-y-2 border-t border-gray-200 pt-2.5">
                      {(fn.detailIds || fn.specialKeys) && (
                        <div className="space-y-1.5 text-[11px]">
                          {fn.detailIds && (
                            <div>
                              <div className="font-semibold text-gray-700">Коды `DetailId` в базе:</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {fn.detailIds.map((d) => (
                                  <span
                                    key={d.id}
                                    className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-700"
                                    title={d.name}
                                  >
                                    <strong>{d.id}</strong>: {d.titleRu}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {fn.specialKeys && (
                            <div>
                              <div className="font-semibold text-amber-900">Спецключи (`Keycode` / `Password`):</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {fn.specialKeys.map((k, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-900"
                                  >
                                    Key <strong>{k.keycode}</strong> (<code>{k.password}</code>) — {k.noteRu}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub-selection dropdown inside every FunctionId */}
                      <label className="block space-y-1">
                        <span className="text-[11px] font-bold text-gray-800">
                          Подвыбор внутри функции ({fn.subOptions.length} подрежимов):
                        </span>
                        <select
                          value={selectedSubId}
                          onChange={(e) =>
                            setSelectedSubOptionByFunc((prev) => ({
                              ...prev,
                              [fn.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-900"
                        >
                          {fn.subOptions.map((opt) => (
                            <option key={opt.subId} value={opt.subId}>
                              {opt.titleRu} [{opt.protocolHint}]
                            </option>
                          ))}
                        </select>
                      </label>

                      {currentSub && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-gray-500">
                          <span>{currentSub.titleEn}</span>
                          <span className="rounded bg-white border border-gray-200 px-1.5 py-0.5 font-bold text-emerald-700">
                            {currentSub.protocolHint}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRunSsm4Function(fn.id, selectedSubId)}
                        className="w-full rounded-lg border border-blue-700 bg-blue-700 hover:bg-blue-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          ▶ Запустить подрежим: {currentSub?.titleRu ?? fn.titleRu}
                        </span>
                        <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">
                          {selectedEcu.code} · #{fn.id}
                        </span>
                      </button>

                      {runRes && (
                        <div
                          className={`rounded-lg border p-2.5 text-[11px] ${
                            runRes.ok
                              ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                              : "border-amber-300 bg-amber-50 text-amber-950"
                          }`}
                        >
                          <div className="font-bold">{runRes.status}</div>
                          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-800 max-h-40 overflow-y-auto">
                            {runRes.lines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  2. Все мониторинги параметров по блокам управления ({SSM4_SIGNALS.length} параметров в {SSM4_ECUS.length} ЭБУ)
                </h4>
                <p className="text-xs text-gray-500">
                  Нажимайте «+ В Live» на любом параметре для добавления в текущий мониторинг или «Вывести все в Live» для всего блока.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTopView("data-monitor")}
                className="rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Перейти в Live ({selectedSignalIds.length} выбрано) →
              </button>
            </div>

            <div className="space-y-3">
              {SSM4_ECUS.map((ecu) => {
                const ecuSignals = SSM4_SIGNALS.filter((s) => s.ecuId === ecu.ecuId);
                return (
                  <div
                    key={ecu.ecuId}
                    className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                          ECU_ID {ecu.ecuId} · {ecu.code}
                        </span>
                        <span className="font-mono text-xs font-semibold text-gray-700">
                          CAN {ecu.txHex} → {ecu.rxHex}
                        </span>
                        <span className="text-xs font-bold text-gray-900">
                          {ecu.nameRu}
                        </span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          {ecu.group} · параметров: {ecuSignals.length}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const ids = ecuSignals.map((s) => s.id);
                            setSelectedSignalIds((prev) =>
                              Array.from(new Set([...prev, ...ids])),
                            );
                          }}
                          className="rounded-lg border border-emerald-500 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
                        >
                          + Добавить все ({ecuSignals.length}) в Live
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEcuId(ecu.ecuId);
                            setSelectedSignalIds(ecuSignals.map((s) => s.id));
                            setTopView("data-monitor");
                          }}
                          className="rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Вывести блок в Live →
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-2 py-1">Группа (.FACL/.CT)</th>
                            <th className="px-2 py-1">Код</th>
                            <th className="px-2 py-1">Параметр (RU / EN)</th>
                            <th className="px-2 py-1">Протокол и DID/PID</th>
                            <th className="px-2 py-1">Ед. изм.</th>
                            <th className="px-2 py-1 text-right">В Live</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {ecuSignals.map((sig) => {
                            const req = buildSsm4RequestHex(sig);
                            const inLive = selectedSignalIds.includes(sig.id);
                            return (
                              <tr key={sig.id} className="hover:bg-gray-50/80">
                                <td className="px-2 py-1 font-medium text-gray-600">
                                  {sig.customList}
                                </td>
                                <td className="px-2 py-1 font-mono font-bold text-emerald-700">
                                  {sig.shortName}
                                </td>
                                <td className="px-2 py-1">
                                  <div className="font-medium text-gray-900">{sig.nameRu}</div>
                                  <div className="text-[10px] text-gray-500">{sig.nameEn}</div>
                                </td>
                                <td className="px-2 py-1 font-mono text-gray-700">
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5">
                                    {req.requestHex}
                                  </span>
                                </td>
                                <td className="px-2 py-1 font-mono text-gray-600">
                                  {sig.unit || "статус"}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (inLive) {
                                        setSelectedSignalIds((prev) =>
                                          prev.filter((id) => id !== sig.id),
                                        );
                                      } else {
                                        setSelectedSignalIds((prev) => [...prev, sig.id]);
                                      }
                                    }}
                                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                                      inLive
                                        ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }`}
                                  >
                                    {inLive ? "− Убрать" : "+ В Live"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
