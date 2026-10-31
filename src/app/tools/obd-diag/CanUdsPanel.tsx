"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useObdScroll } from "./ObdScrollContext";
import type {
  ModuleDtcReport,
  ModuleScanItem,
  ObdBleSession,
  SubaruRegionConfigDump,
  SubaruRegionModuleReport,
} from "@/lib/obd/obd-session";
import {
  type CanProtocol,
  type CsvRow,
  formatFrameData,
  framesToCsv,
  parseMonitorLine,
} from "@/lib/obd/can-frame";
import {
  KNOWN_MODULE_TARGETS,
  UDS_TEMPLATES,
  type CustomDid,
  type SubaruDidDiffEntry,
  type UdsLogEntry,
  appendUdsLog,
  assessUdsRequest,
  diffSubaruDumps,
  exportUdsLog,
  formatUdsPayload,
  loadCustomDids,
  loadUdsLog,
  saveCustomDids,
} from "@/lib/obd/uds";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import { EXTENDED_COMMANDS, decodeExtendedSignals, type DecodedSignal } from "@/lib/obd/extended-signals";
import {
  decodeCanBroadcastFrame,
  diffCanBusSnapshots,
  type CanFrameDiffEntry,
  type DecodedBroadcastSignal,
  type MitsubishiMeterReport,
  type MitsubishiTcmTelemetry,
  type TpmsModuleReport,
} from "@/lib/obd/mitsubishi-modules";

type TpmsWheelPosition = "FL" | "FR" | "RR" | "RL" | "SPARE";

const RECORD_LIMIT = 50_000;
const TAPE_LIMIT = 40;

type CanSubView = "dashboard" | "safety" | "dtcs" | "expert" | "monitor";

interface FrameRow {
  id: string;
  dlc: number;
  data: number[];
  count: number;
  periodMs: number | null;
  changed: boolean[];
  flashAt: number;
}

export default function CanUdsPanel({
  session,
  enabled,
  linkLostTick,
  onLog,
}: {
  session: ObdBleSession;
  enabled: boolean;
  linkLostTick: number;
  onLog: (line: string) => void;
}) {
  const obdScroll = useObdScroll();
  const deferUiRef = useRef<(apply: () => void) => void>((apply) => apply());
  useEffect(() => {
    deferUiRef.current = obdScroll?.deferUiUpdate ?? ((apply: () => void) => apply());
  }, [obdScroll]);
  const deferUi = useCallback((apply: () => void) => {
    deferUiRef.current(apply);
  }, []);
  const [protocol, setProtocol] = useState<CanProtocol>("6");
  const [view, setView] = useState<CanSubView>("dashboard");
  const [monitoring, setMonitoring] = useState(false);
  const [rows, setRows] = useState<FrameRow[]>([]);
  const [tape, setTape] = useState<string[]>([]);
  const [losses, setLosses] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [incomplete, setIncomplete] = useState(false);
  const [note, setNote] = useState("нажал тормоз");
  const [filterId, setFilterId] = useState("");
  const [filterMask, setFilterMask] = useState("");
  const [volts, setVolts] = useState<number | null>(null);
  const [tx, setTx] = useState("7E0");
  const [rx, setRx] = useState("7E8");
  const [request, setRequest] = useState("22 F190");
  const [developer, setDeveloper] = useState(false);
  const [customDids, setCustomDids] = useState<CustomDid[]>(() => loadCustomDids());
  const [didLabel, setDidLabel] = useState("");
  const [udsText, setUdsText] = useState<string | null>(null);
  const [udsRaw, setUdsRaw] = useState<string | null>(null);
  const [udsLog, setUdsLog] = useState<UdsLogEntry[]>(() => loadUdsLog());
  const [scanRows, setScanRows] = useState<ModuleScanItem[]>([]);
  const [didHits, setDidHits] = useState<{ did: string; text: string }[]>([]);
  const [didProgress, setDidProgress] = useState("");
  const [watchedDids, setWatchedDids] = useState<string[]>(["F18E", "F197"]);
  const [liveUdsRunning, setLiveUdsRunning] = useState(false);
  const [liveUdsRows, setLiveUdsRows] = useState<
    {
      did: string;
      text: string;
      initialText: string;
      changed: boolean;
      count: number;
    }[]
  >([]);
  const [catalog, setCatalog] = useState<DecodedSignal[]>([]);
  const [subaruDump, setSubaruDump] = useState<SubaruRegionConfigDump | null>(null);
  const [subaruProgress, setSubaruProgress] = useState("");
  const [subaruPartial, setSubaruPartial] = useState<SubaruRegionModuleReport[]>([]);
  const [diffDumpA, setDiffDumpA] = useState<{ name: string; dump: SubaruRegionConfigDump } | null>(null);
  const [diffDumpB, setDiffDumpB] = useState<{ name: string; dump: SubaruRegionConfigDump } | null>(null);
  const [diffRows, setDiffRows] = useState<SubaruDidDiffEntry[] | null>(null);

  // Mitsubishi AT/CVT (7E1 -> 7E9) live & single-shot state
  const [mitsuTcmData, setMitsuTcmData] = useState<MitsubishiTcmTelemetry | null>(null);
  const [mitsuTcmLive, setMitsuTcmLive] = useState(false);
  const stopMitsuTcmRef = useRef(false);

  // TPMS (773 / 600 / 752) state + wheel order persistence
  const [tpmsTarget, setTpmsTarget] = useState<"mitsubishi-773" | "mitsubishi-600" | "subaru-752">("mitsubishi-773");
  const [tpmsReport, setTpmsReport] = useState<TpmsModuleReport | null>(null);
  const [tpmsUnit, setTpmsUnit] = useState<"bar" | "kpa" | "psi">("bar");
  const [tpmsWheelMap, setTpmsWheelMap] = useState<Record<TpmsWheelPosition, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedMap = localStorage.getItem("qhub.obd.tpms-wheel-map");
        if (savedMap) {
          const parsed = JSON.parse(savedMap) as Record<TpmsWheelPosition, number>;
          if (parsed && typeof parsed.FL === "number") {
            return parsed;
          }
        }
      } catch {
        /* ignore */
      }
    }
    return {
      FL: 0,
      FR: 1,
      RR: 2,
      RL: 3,
      SPARE: 4,
    };
  });

  // Mitsubishi Combination Meter (6A0 -> 514) state
  const [mitsuMeter, setMitsuMeter] = useState<MitsubishiMeterReport | null>(null);

  // CAN Diff-Sniffer state
  const [canBaseline, setCanBaseline] = useState<{ id: string; dlc: number; data: number[] }[] | null>(null);
  const [canDiffResult, setCanDiffResult] = useState<CanFrameDiffEntry[] | null>(null);

  // Safety modules (7B0 ABS/VDC/EPB & 780 SRS Airbag) read-only state
  const [safetyRows, setSafetyRows] = useState<
    { group: "abs" | "srs"; label: string; value: string }[]
  >([]);

  // Multi-module DTC scan & safe clear state
  const [dtcReports, setDtcReports] = useState<ModuleDtcReport[]>([]);
  const [dtcProgress, setDtcProgress] = useState("");
  const [dtcBanner, setDtcBanner] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const stopScanRef = useRef(false);
  const stopLiveUdsRef = useRef(false);
  const recordsRef = useRef<CsvRow[]>([]);
  const recordingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const rowsRef = useRef<FrameRow[]>([]);
  const tapeRef = useRef<string[]>([]);
  const pendingMonitorUiRef = useRef(false);
  const mitsuTcmLatestRef = useRef<MitsubishiTcmTelemetry | null>(null);
  const pendingMitsuTcmUiRef = useRef(false);

  useEffect(() => {
    tapeRef.current = tape;
  }, [tape]);

  useEffect(() => {
    if (!obdScroll) return;
    return obdScroll.registerScrollFlush(() => {
      if (pendingMonitorUiRef.current) {
        pendingMonitorUiRef.current = false;
        setRows([...rowsRef.current]);
        setTape([...tapeRef.current]);
      }
      if (pendingMitsuTcmUiRef.current && mitsuTcmLatestRef.current) {
        pendingMitsuTcmUiRef.current = false;
        setMitsuTcmData(mitsuTcmLatestRef.current);
      }
    });
  }, [obdScroll]);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    void session
      .readSupplyVoltage()
      .then((value) => {
        if (!cancel) setVolts(value);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [enabled, session]);

  useEffect(() => {
    if (linkLostTick === 0) return;
    const timer = window.setTimeout(() => {
      setMonitoring(false);
      if (recordingRef.current) setIncomplete(true);
      recordingRef.current = false;
      setRecording(false);
      setLocalError("Связь с адаптером прервалась. Запись помечена как незавершённая. Подключите vLinker снова.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [linkLostTick]);

  useEffect(() => {
    if (enabled) return;
    const timer = window.setTimeout(() => {
      setMonitoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    return () => {
      void session.leaveSpecialMode();
    };
  }, [session]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const batch = queueRef.current.splice(0);
      const now = Date.now();
      if (batch.length === 0) {
        const stale = rowsRef.current.some((row) => row.changed.some(Boolean) && now - row.flashAt > 500);
        if (!stale) return;
        const faded = rowsRef.current.map((row) =>
          now - row.flashAt > 500 ? { ...row, changed: row.changed.map(() => false) } : row,
        );
        rowsRef.current = faded;
        if (obdScroll?.scrollingRef.current) pendingMonitorUiRef.current = true;
        else setRows(faded);
        return;
      }
      let lossAdd = 0;
      const tapeAdd: string[] = [];
      let next = rowsRef.current.map((row) =>
        now - row.flashAt > 500 ? { ...row, changed: row.changed.map(() => false) } : row,
      );
      for (const line of batch) {
        const event = parseMonitorLine(line, protocol);
        if (event.kind === "loss") {
          lossAdd += 1;
          tapeAdd.push(event.message);
          onLog(event.message);
          continue;
        }
        if (event.kind !== "frame") continue;
        const { frame } = event;
        const stamp = new Date().toISOString();
        tapeAdd.push(`${frame.id} ${frame.dlc} ${formatFrameData(frame.data)}`);
        const index = next.findIndex((row) => row.id === frame.id);
        const previous = index >= 0 ? next[index] : undefined;
        const changed = frame.data.map((byte, i) => previous?.data[i] !== byte);
        const periodMs = previous ? now - previous.flashAt : null;
        const row: FrameRow = {
          id: frame.id,
          dlc: frame.dlc,
          data: frame.data,
          count: (previous?.count ?? 0) + 1,
          periodMs: previous?.flashAt ? now - previous.flashAt : periodMs,
          changed,
          flashAt: now,
        };
        if (previous) next[index] = row;
        else next = [...next, row];
        if (recordingRef.current && recordsRef.current.length < RECORD_LIMIT) {
          recordsRef.current.push({
            t: stamp,
            id: frame.id,
            dlc: String(frame.dlc),
            data: formatFrameData(frame.data),
            note: "",
          });
        }
      }
      rowsRef.current = next;
      if (tapeAdd.length) {
        tapeRef.current = [...tapeRef.current, ...tapeAdd].slice(-TAPE_LIMIT);
      }
      if (obdScroll?.scrollingRef.current) {
        pendingMonitorUiRef.current = true;
      } else {
        setRows(next);
        if (tapeAdd.length) setTape(tapeRef.current);
        if (lossAdd) setLosses((count) => count + lossAdd);
        if (recordingRef.current) setRecordCount(recordsRef.current.length);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [obdScroll, onLog, protocol]);

  const remember = (entry: UdsLogEntry) => {
    setUdsLog(appendUdsLog(entry));
  };

  const startMonitor = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await session.startCanMonitor(protocol, (line) => {
        queueRef.current.push(line);
      });
      setMonitoring(true);
      onLog(`CAN-монитор ATSP${protocol}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось запустить монитор");
    } finally {
      setBusy(false);
    }
  };

  const stopMonitor = async () => {
    setBusy(true);
    try {
      await session.stopCanMonitor();
      setMonitoring(false);
      onLog("CAN-монитор остановлен");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось остановить монитор");
    } finally {
      setBusy(false);
    }
  };

  const applyFilter = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await session.applyCanFilter(protocol, filterId, filterMask);
      onLog(filterId.trim() ? `Фильтр ${filterId} / ${filterMask}` : "Фильтр снят");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Фильтр не применён");
    } finally {
      setBusy(false);
    }
  };

  const exportCapture = async () => {
    const csv = framesToCsv(recordsRef.current, incomplete);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    await saveBlobToDevice(new Blob([csv], { type: "text/csv" }), `can-${stamp}.csv`);
    onLog(`CSV: ${recordsRef.current.length} кадров`);
  };

  const addNote = () => {
    if (!recordingRef.current) return;
    const text = note.trim();
    if (!text || recordsRef.current.length >= RECORD_LIMIT) return;
    recordsRef.current.push({ t: new Date().toISOString(), id: "", dlc: "", data: "", note: text });
    setRecordCount(recordsRef.current.length);
    setTape((prev) => [...prev, `метка: ${text}`].slice(-TAPE_LIMIT));
  };

  const sendRequest = async (hex: string) => {
    const normal = assessUdsRequest(hex, false);
    if (!normal.ok) {
      if (!developer) {
        setLocalError(normal.message);
        remember({
          t: new Date().toISOString(),
          tx,
          rx,
          request: hex,
          response: `заблокировано: ${normal.message}`,
        });
        return;
      }
      const confirmed = window.confirm(
        `${normal.message}\n\nРежим разработчика отправит этот запрос в блок. Продолжить?`,
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const result = await session.sendUds(protocol, tx, rx, hex, developer);
      const cleanRaw = result.raw.replace(/>/g, "").replace(/\s+/g, " ").trim();
      const summary =
        result.parsed.kind === "positive"
          ? formatUdsPayload(result.parsed.payload, result.parsed.sid, tx)
          : result.parsed.kind === "negative"
            ? `Отказ блока (7F): ${result.parsed.nrcText ?? ""}`.trim()
            : cleanRaw.slice(0, 180) || "пустой ответ";
      setUdsText(summary);
      setUdsRaw(cleanRaw || null);
      remember({ t: new Date().toISOString(), tx, rx, request: hex, response: summary });
      onLog(`UDS ${hex} [${tx}→${rx || "auto"}]: ${summary.slice(0, 120)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка UDS";
      setLocalError(message);
      remember({ t: new Date().toISOString(), tx, rx, request: hex, response: message });
    } finally {
      setBusy(false);
    }
  };

  const saveDid = () => {
    const gate = assessUdsRequest(request, false);
    if (!gate.ok) {
      setLocalError("Свой шаблон сохраняется только для команды чтения.");
      return;
    }
    const label = didLabel.trim() || request.trim();
    const next = [...customDids, { id: `${Date.now()}`, label, hex: request.trim() }];
    setCustomDids(next);
    saveCustomDids(next);
    setDidLabel("");
  };

  const runCatalog = async (group: "subaru" | "subaru-tcm" | "pajero") => {
    setBusy(true);
    setLocalError(null);
    setCatalog([]);
    const rows: DecodedSignal[] = [];
    setProtocol("6");
    if (group === "subaru-tcm") {
      setTx("7E1");
      setRx("7E9");
    } else {
      setTx("7E0");
      setRx("7E8");
    }
    try {
      if (group === "subaru-tcm") {
        const udsRows: DecodedSignal[] = [];
        try {
          const res09 = await session.sendUds("6", "7E1", "7E9", "09 04", false);
          if (res09.parsed.kind === "positive") {
            udsRows.push({
              name: "Калибровка КПП (7E1 · 09 04)",
              value: formatUdsPayload(res09.parsed.payload, 0x09).replace(/^Калибровка \(CalID\):\s*/, ""),
              unit: "",
            });
            setCatalog([...udsRows]);
          }
        } catch {
          /* ignore */
        }

        try {
          const res03 = await session.sendUds("6", "7E1", "7E9", "03", false);
          if (res03.parsed.kind === "positive") {
            const dtcCount = res03.parsed.payload[0] ?? 0;
            udsRows.push({
              name: "Ошибки КПП (7E1 · Mode 03)",
              value: dtcCount === 0 ? "0 ошибок" : `${dtcCount} шт.`,
              unit: "",
            });
            setCatalog([...udsRows]);
          }
        } catch {
          /* ignore */
        }

        // Probe SGP 2.4 TURBO Powertrain UDS module (7A2 -> 7AA)
        setTx("7A2");
        setRx("7AA");
        let opened7A2 = false;
        try {
          const r10 = await session.sendUds("6", "7A2", "7AA", "10 03", false);
          if (r10.parsed.kind === "positive") opened7A2 = true;
        } catch {
          /* ignore */
        }

        const sgp7A2Dids: { did: string; label: string }[] = [
          { did: "F197", label: "Блок силовой установки (7A2)" },
          { did: "1297", label: "7A2 · Темп. ДВС / масла (1297)" },
          { did: "1298", label: "7A2 · Темп. впуска (1298)" },
          { did: "103D", label: "7A2 · Темп. КПП / узла (103D)" },
          { did: "1001", label: "7A2 · Темп. агрегата 1 (1001)" },
          { did: "1005", label: "7A2 · Темп. агрегата 2 (1005)" },
          { did: "10CB", label: "7A2 · Темп. контура A (10CB)" },
          { did: "10CC", label: "7A2 · Темп. контура B (10CC)" },
          { did: "2021", label: "7A2 · Канал 2021" },
          { did: "2022", label: "7A2 · Канал 2022" },
          { did: "2023", label: "7A2 · Канал 2023" },
          { did: "2024", label: "7A2 · Канал 2024" },
          { did: "2027", label: "7A2 · Нагрузка привода (2027)" },
          { did: "101E", label: "7A2 · Счётчик и таймер зажигания (101E)" },
        ];
        for (const item of sgp7A2Dids) {
          try {
            const res = await session.sendUds("6", "7A2", "7AA", `22 ${item.did}`, false);
            if (res.parsed.kind === "positive") {
              udsRows.push({
                name: item.label,
                value: formatUdsPayload(res.parsed.payload, 0x22, "7A2"),
                unit: "",
              });
              setCatalog([...udsRows]);
            }
          } catch {
            /* ignore */
          }
        }
        if (opened7A2) {
          try {
            await session.sendUds("6", "7A2", "7AA", "10 01", false);
          } catch {
            /* ignore */
          }
        }

        // Probe SGP BIU / TPMS Tire Pressures (752 -> 75A)
        let opened752 = false;
        try {
          const r10 = await session.sendUds("6", "752", "75A", "10 03", false);
          if (r10.parsed.kind === "positive") opened752 = true;
        } catch {
          /* ignore */
        }
        for (const [idx, didHex] of (["1021", "1022", "1023", "1024"] as const).entries()) {
          try {
            const res = await session.sendUds("6", "752", "75A", `22 ${didHex}`, false);
            if (res.parsed.kind === "positive" && res.parsed.payload.length >= 3) {
              const rawVal = res.parsed.payload[2]!;
              const bar = (rawVal * 0.01379).toFixed(2);
              const psi = (rawVal * 0.2).toFixed(1);
              udsRows.push({
                name: `Давление шины ${idx + 1} (752 · 22 ${didHex})`,
                value: `${bar} бар (${psi} PSI) [0x${rawVal.toString(16).toUpperCase()}=${rawVal}]`,
                unit: "",
              });
              setCatalog([...udsRows]);
            }
          } catch {
            /* ignore */
          }
        }
        if (opened752) {
          try {
            await session.sendUds("6", "752", "75A", "10 01", false);
          } catch {
            /* ignore */
          }
        }

        // Probe SGP Combination Meter (783 -> 78B): battery voltage (101B), temperature (1007), fuel tank sensors (1041/1042)
        let opened783 = false;
        try {
          const r10 = await session.sendUds("6", "783", "78B", "10 03", false);
          if (r10.parsed.kind === "positive") opened783 = true;
        } catch {
          /* ignore */
        }
        for (const item of [
          { did: "101B", label: "Приборка (783) · Бортсеть (101B)" },
          { did: "1007", label: "Приборка (783) · Температура (1007)" },
          { did: "1041", label: "Приборка (783) · Бак левый (1041)" },
          { did: "1042", label: "Приборка (783) · Бак правый (1042)" },
        ]) {
          try {
            const res = await session.sendUds("6", "783", "78B", `22 ${item.did}`, false);
            if (res.parsed.kind === "positive") {
              udsRows.push({
                name: item.label,
                value: formatUdsPayload(res.parsed.payload, 0x22, "783"),
                unit: "",
              });
              setCatalog([...udsRows]);
            }
          } catch {
            /* ignore */
          }
        }
        if (opened783) {
          try {
            await session.sendUds("6", "783", "78B", "10 01", false);
          } catch {
            /* ignore */
          }
        }

        setCatalog(
          udsRows.length > 0
            ? udsRows
            : [
                {
                  name: "Subaru SGP (7E1 / 7A2 / 752 / 783)",
                  value: "Нет ответа — проверьте зажигание ON",
                  unit: "",
                },
              ],
        );
      } else {
        for (const command of EXTENDED_COMMANDS.filter((item) => item.group === group)) {
          try {
            const result = await session.sendUds("6", command.tx, command.rx, command.hex, false);
            if (result.parsed.kind === "positive") {
              rows.push(...decodeExtendedSignals(command, result.parsed.payload));
            } else {
              const raw = result.raw.replace(/>/g, "").replace(/\s+/g, " ").trim();
              rows.push({
                name: command.label,
                value: result.parsed.nrcText ?? (raw ? raw.slice(0, 60) : "нет ответа"),
                unit: "",
              });
            }
          } catch (error) {
            rows.push({
              name: command.label,
              value: error instanceof Error ? error.message : "ошибка",
              unit: "",
            });
          }
          setCatalog([...rows]);
        }
      }

      onLog(
        group === "subaru"
          ? "Subaru ДВС (7E0)"
          : group === "subaru-tcm"
            ? "Subaru КПП (7E1)"
            : "Pajero 21 (7E0)",
      );
    } finally {
      setBusy(false);
    }
  };

  const runSubaruRegionDump = async () => {
    setBusy(true);
    stopScanRef.current = false;
    setLocalError(null);
    setSubaruDump(null);
    setSubaruPartial([]);
    setSubaruProgress("Старт безопасного чтения (Read-Only Service 22)…");
    try {
      const dump = await session.readSubaruMeterEyesightConfig(
        protocol,
        (status, partial) => {
          deferUi(() => {
            setSubaruProgress(status);
            setSubaruPartial(partial);
          });
        },
        () => stopScanRef.current,
      );
      setSubaruDump(dump);
      setSubaruProgress("");
      const answered = dump.modules.filter((m) => m.responded).length;
      onLog(`Subaru Приборка/EyeSight/BIU (Read-Only): ответило ${answered} блоков`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось прочитать блоки Subaru");
    } finally {
      setBusy(false);
    }
  };

  const exportSubaruDump = async () => {
    if (!subaruDump) return;
    const stamp = subaruDump.capturedAt.slice(0, 19).replace(/[:T]/g, "-");
    const vinPart = subaruDump.vin ? `-${subaruDump.vin}` : "";
    const json = JSON.stringify(subaruDump, null, 2);
    await saveBlobToDevice(
      new Blob([json], { type: "application/json" }),
      `subaru-meter-eyesight${vinPart}-${stamp}.json`,
    );
    onLog("Сохранён JSON-дамп конфигурации Subaru (Приборка / EyeSight / BIU)");
  };

  const loadSubaruDumpFile = async (slot: "A" | "B", file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SubaruRegionConfigDump;
      if (!parsed || !Array.isArray(parsed.modules)) {
        setLocalError("Файл не похож на JSON-дамп Subaru SGP (нет поля modules).");
        return;
      }
      const nextA = slot === "A" ? { name: file.name, dump: parsed } : diffDumpA;
      const nextB = slot === "B" ? { name: file.name, dump: parsed } : diffDumpB;
      if (slot === "A") setDiffDumpA(nextA);
      else setDiffDumpB(nextB);
      if (nextA && nextB) {
        setDiffRows(diffSubaruDumps(nextA.dump, nextB.dump));
      }
    } catch {
      setLocalError("Не удалось прочитать JSON-файл дампа.");
    }
  };

  const scan = async (
    kind: "10 01" | "3E 00",
    preset: "standard" | "extended" | "wide" = "extended",
  ) => {
    setBusy(true);
    stopScanRef.current = false;
    setScanRows([]);
    setLocalError(null);
    try {
      await session.scanModules(
        protocol,
        kind,
        (address, detail, item) => {
          deferUi(() => {
            setScanRows((prev) => {
              const without = prev.filter((row) => row.address !== address);
              const entry: ModuleScanItem = item ?? {
                address,
                name: `Блок ${address}`,
                detail,
                responded: detail.includes("ответил"),
                txHex: address === "7DF" ? "7E0" : address,
                rxHex: address === "7DF" ? "7E8" : "",
              };
              return [...without, entry];
            });
          });
        },
        { preset, shouldStop: () => stopScanRef.current },
      );
      onLog(
        `Сканер блоков ${kind} (${
          preset === "wide"
            ? "Вся шина 700–7E7"
            : preset === "extended"
              ? "Полный опрос Launch"
              : "7E0–7DF"
        })`,
      );
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Сканер остановлен");
    } finally {
      setBusy(false);
    }
  };

  const toggleWatchedDid = (didHex: string) => {
    const clean = didHex.replace(/^22\s*/i, "").replace(/\s+/g, "").toUpperCase();
    if (!/^[0-9A-F]{4}$/.test(clean)) return;
    setWatchedDids((prev) =>
      prev.includes(clean) ? prev.filter((item) => item !== clean) : [...prev, clean],
    );
  };

  const scanDids = async (range?: { from: number; to: number; label: string; stopOnSilence?: boolean }) => {
    setBusy(true);
    stopScanRef.current = false;
    setDidHits([]);
    const totalCount = range ? range.to - range.from + 1 : 128;
    setDidProgress(`0 / ${totalCount}`);
    setLocalError(null);
    try {
      await session.scanIdentificationDids(
        protocol,
        tx,
        rx,
        (done, total, hit) => {
          deferUi(() => {
            setDidProgress(`${done} / ${total}`);
            if (hit) {
              setDidHits((prev) => [...prev, hit]);
              setWatchedDids((prev) => {
                if (prev.includes(hit.did) || prev.length >= 12) return prev;
                return [...prev, hit.did];
              });
            }
          });
        },
        () => stopScanRef.current,
        range,
      );
      onLog(`Сканер DID ${range?.label ?? "F180–F1FF"} (${tx})`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Сканер DID остановлен");
    } finally {
      setBusy(false);
    }
  };

  const startLiveUds = async () => {
    if (watchedDids.length === 0) {
      setLocalError("Выберите хотя бы один DID для Live-потока (или запустите поиск датчиков ниже).");
      return;
    }
    stopLiveUdsRef.current = false;
    setLiveUdsRunning(true);
    setBusy(true);
    setLocalError(null);
    onLog(`Live-поток UDS [${tx}→${rx}]: ${watchedDids.join(", ")}`);
    try {
      // Open extended session once so sensor DIDs stay accessible
      try {
        await session.sendUds(protocol, tx, rx, "1003", false);
      } catch {
        // Ignore if ECU works in default session
      }
      let step = 0;
      while (!stopLiveUdsRef.current) {
        for (const did of watchedDids) {
          if (stopLiveUdsRef.current) break;
          step += 1;
          if (step % 6 === 0) {
            try {
              await session.sendUds(protocol, tx, rx, "3E00", false);
            } catch {
              // Ignore keepalive failure
            }
          }
          try {
            const res = await session.sendUds(protocol, tx, rx, `22${did}`, false);
            if (res.parsed.kind === "positive") {
              const text = formatUdsPayload(res.parsed.payload, res.parsed.sid, tx);
              deferUi(() => {
                setLiveUdsRows((prev) => {
                  const existing = prev.find((r) => r.did === did);
                  if (!existing) {
                    return [
                      ...prev,
                      {
                        did,
                        text,
                        initialText: text,
                        changed: false,
                        count: 1,
                      },
                    ];
                  }
                  const changed = existing.changed || existing.initialText !== text;
                  return prev.map((r) =>
                    r.did === did ? { ...r, text, changed, count: r.count + 1 } : r,
                  );
                });
              });
            }
          } catch {
            // Continue polling next DID
          }
        }
      }
    } finally {
      try {
        await session.sendUds(protocol, tx, rx, "1001", false);
      } catch {
        // Ignore
      }
      setLiveUdsRunning(false);
      setBusy(false);
      onLog(`Live-поток UDS [${tx}] остановлен (возврат в 10 01)`);
    }
  };

  const stopLiveUds = () => {
    stopLiveUdsRef.current = true;
  };

  const readMitsuTcmOnce = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      const data = await session.readMitsubishiTransmission();
      setMitsuTcmData(data);
      onLog(
        `Mitsubishi АКПП/CVT (7E1): темп=${data.atfTempC ?? "—"}°C, передача=${data.currentGearText}, ${data.disengagedStateText}`,
      );
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка чтения АКПП/CVT Mitsubishi");
    } finally {
      setBusy(false);
    }
  };

  const startMitsuTcmLive = async () => {
    stopMitsuTcmRef.current = false;
    setMitsuTcmLive(true);
    setBusy(true);
    setLocalError(null);
    onLog("Старт живого опроса АКПП/CVT Mitsubishi (7E1 → 7E9 · KWP 21 02 / 21 04)");
    try {
      while (!stopMitsuTcmRef.current) {
        try {
          const data = await session.readMitsubishiTransmission();
          mitsuTcmLatestRef.current = data;
          if (obdScroll?.scrollingRef.current) pendingMitsuTcmUiRef.current = true;
          else setMitsuTcmData(data);
        } catch {
          /* continue polling */
        }
      }
    } finally {
      setMitsuTcmLive(false);
      setBusy(false);
      onLog("Живой опрос АКПП/CVT Mitsubishi остановлен");
    }
  };

  const stopMitsuTcmLive = () => {
    stopMitsuTcmRef.current = true;
  };

  const readTpmsOnce = async (
    targetOverride?: "mitsubishi-773" | "mitsubishi-600" | "subaru-752",
  ) => {
    const activeTarget = targetOverride ?? tpmsTarget;
    if (targetOverride) setTpmsTarget(targetOverride);
    setBusy(true);
    setLocalError(null);
    try {
      const report = await session.readTpmsSensors(activeTarget);
      setTpmsReport(report);
      onLog(`TPMS (${report.moduleName}): прочитано датчиков колёс: ${report.wheels.length}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка чтения датчиков шин TPMS");
    } finally {
      setBusy(false);
    }
  };

  const updateTpmsWheelMapping = (pos: TpmsWheelPosition, sensorIndex: number) => {
    const next = { ...tpmsWheelMap, [pos]: sensorIndex };
    setTpmsWheelMap(next);
    try {
      localStorage.setItem("qhub.obd.tpms-wheel-map", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const readMitsuMeterOnce = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      const meter = await session.readMitsubishiMeter();
      setMitsuMeter(meter);
      onLog(
        `Приборка Mitsubishi (6A0 → 514): топливо=${meter.fuelLiters ?? "—"} л, пробег=${meter.odometerKm ?? "—"} км`,
      );
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка чтения приборки 6A0");
    } finally {
      setBusy(false);
    }
  };

  const captureCanBaseline = () => {
    const snap = rowsRef.current.map((r) => ({ id: r.id, dlc: r.dlc, data: [...r.data] }));
    setCanBaseline(snap);
    setCanDiffResult(null);
    onLog(`CAN Diff: запомнен фоновый снимок (${snap.length} CAN ID)`);
  };

  const compareCanAction = () => {
    if (!canBaseline) return;
    const actionSnap = rowsRef.current.map((r) => ({ id: r.id, dlc: r.dlc, data: [...r.data] }));
    const diffs = diffCanBusSnapshots(canBaseline, actionSnap);
    setCanDiffResult(diffs);
    onLog(`CAN Diff: найдено изменившихся фреймов: ${diffs.length}`);
  };

  const readSafetyModulesOnce = async (targetGroup: "all" | "abs" | "srs" = "all") => {
    setBusy(true);
    setLocalError(null);
    const out: { group: "abs" | "srs"; label: string; value: string }[] = [];
    setSafetyRows([]);
    try {
      if (targetGroup === "all" || targetGroup === "abs") {
        let opened7B0 = false;
        try {
          const r10 = await session.sendUds(protocol, "7B0", "7B8", "10 03", false);
          if (r10.parsed.kind === "positive") opened7B0 = true;
        } catch {
          /* ignore */
        }
        const absDids: { did: string; label: string }[] = [
          { did: "F197", label: "Система тормозов (F197)" },
          { did: "F18E", label: "Номер блока OEM (F18E)" },
          { did: "F182", label: "Калибровка Data ID (F182)" },
          { did: "101B", label: "Напряжение питания ABS (101B)" },
          { did: "1019", label: "Опорное питание датчиков (1019)" },
          { did: "1001", label: "Давление в тормозной магистрали (1001)" },
          { did: "1006", label: "Датчик ускорения G (1006)" },
          { did: "200D", label: "Усилие затяжки электроручника EPB (200D)" },
          { did: "2012", label: "Статус актуатора EPB (2012)" },
          { did: "200A", label: "Счётчик срабатываний EPB (200A)" },
          { did: "101E", label: "Счётчик запусков и таймер (101E)" },
        ];
        for (const item of absDids) {
          try {
            const res = await session.sendUds(protocol, "7B0", "7B8", `22 ${item.did}`, false);
            if (res.parsed.kind === "positive") {
              out.push({
                group: "abs",
                label: item.label,
                value: formatUdsPayload(res.parsed.payload, 0x22, "7B0"),
              });
              deferUi(() => setSafetyRows([...out]));
            }
          } catch {
            /* ignore */
          }
        }
        if (opened7B0) {
          try {
            await session.sendUds(protocol, "7B0", "7B8", "10 01", false);
          } catch {
            /* ignore */
          }
        }
      }

      if (targetGroup === "all" || targetGroup === "srs") {
        let opened780 = false;
        try {
          const r10 = await session.sendUds(protocol, "780", "788", "10 03", false);
          if (r10.parsed.kind === "positive") opened780 = true;
        } catch {
          /* ignore */
        }
        const srsDids: { did: string; label: string }[] = [
          { did: "F197", label: "Система подушек (F197)" },
          { did: "F18E", label: "Номер блока OEM (F18E)" },
          { did: "1022", label: "Код модели SRS (1022)" },
          { did: "105F", label: "Серийный номер блока SRS (105F)" },
          { did: "101B", label: "Напряжение питания SRS (101B)" },
          { did: "1007", label: "Внутренняя температура SRS (1007)" },
          { did: "1044", label: "Замок ремня водителя (1044)" },
          { did: "1045", label: "Замок ремня пассажира (1045)" },
          { did: "1047", label: "Датчик присутствия пассажира (1047)" },
          { did: "1023", label: "Пиропатрон 1 — водитель (1023)" },
          { did: "1024", label: "Пиропатрон 2 — пассажир (1024)" },
          { did: "1026", label: "Пиропатрон 3 — боковой Л (1026)" },
          { did: "1027", label: "Пиропатрон 4 — боковой П (1027)" },
          { did: "1028", label: "Пиропатрон 5 — шторка Л (1028)" },
          { did: "1029", label: "Пиропатрон 6 — шторка П (1029)" },
          { did: "102C", label: "Пиропатрон 7 — колени (102C)" },
          { did: "102E", label: "Преднатяжитель ремня 1 (102E)" },
          { did: "102F", label: "Преднатяжитель ремня 2 (102F)" },
          { did: "101E", label: "Счётчик запусков и таймер (101E)" },
        ];
        for (const item of srsDids) {
          try {
            const res = await session.sendUds(protocol, "780", "788", `22 ${item.did}`, false);
            if (res.parsed.kind === "positive") {
              out.push({
                group: "srs",
                label: item.label,
                value: formatUdsPayload(res.parsed.payload, 0x22, "780"),
              });
              deferUi(() => setSafetyRows([...out]));
            }
          } catch {
            /* ignore */
          }
        }
        if (opened780) {
          try {
            await session.sendUds(protocol, "780", "788", "10 01", false);
          } catch {
            /* ignore */
          }
        }
      }
      onLog("Чтение блоков безопасности ABS/EPB (7B0) и SRS Airbag (780) завершено (Read-Only)");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка чтения блоков безопасности");
    } finally {
      setBusy(false);
    }
  };

  const runAllModuleDtcScan = async () => {
    setBusy(true);
    stopScanRef.current = false;
    setLocalError(null);
    setDtcBanner(null);
    setDtcReports([]);
    setDtcProgress("Опрос ошибок по всем блокам…");
    try {
      const list = await session.scanAllModuleDtcs(
        protocol,
        (status, partial) => {
          deferUi(() => {
            setDtcProgress(status);
            setDtcReports(partial);
          });
        },
        () => stopScanRef.current,
      );
      setDtcReports(list);
      setDtcProgress("");
      const totalDtcs = list.reduce((sum, item) => sum + item.dtcs.length, 0);
      const answered = list.filter((item) => item.responded).length;
      onLog(`Диагностика DTC по блокам: ответило ${answered} блоков, найдено ошибок: ${totalDtcs}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось опросить ошибки блоков");
    } finally {
      setBusy(false);
    }
  };

  const handleSafeClearModuleDtc = async (mod: ModuleDtcReport) => {
    if (!mod.canSafeClear || mod.safetyCritical) {
      setLocalError(
        `Блок ${mod.title} относится к системам безопасности (SRS / ABS / EPS / EyeSight) — сброс заблокирован, разрешено только чтение.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `Стереть коды ошибок в блоке «${mod.title}» (${mod.txHex} → ${mod.rxHex})?\n\nЗажигание должно быть включено (ON), двигатель заглушен.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setLocalError(null);
    setDtcBanner(null);
    try {
      const msg = await session.clearModuleDtcsSafe(protocol, mod.txHex, mod.rxHex);
      setDtcBanner(msg);
      onLog(msg);
      // Re-scan to confirm cleared status
      const updated = await session.scanAllModuleDtcs(protocol);
      setDtcReports(updated);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка сброса DTC");
    } finally {
      setBusy(false);
    }
  };

  const hwBusy = !enabled || busy;

  const switchCanSubView = (nextView: CanSubView) => {
    void (async () => {
      if (monitoring && nextView !== "monitor") {
        await stopMonitor();
      }
      if (mitsuTcmLive && nextView !== "dashboard") {
        stopMitsuTcmRef.current = true;
      }
      if (liveUdsRunning && nextView !== "expert") {
        stopLiveUdsRef.current = true;
      }
      setView(nextView);
    })();
  };

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {!enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
          <span>
            Сначала подключите адаптер сверху, чтобы отправлять запросы в CAN. Навигация, настройка колёс TPMS и сравнение дампов доступны офлайн.
          </span>
          {recordCount > 0 ? (
            <button
              type="button"
              onClick={() => void exportCapture()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800"
            >
              CSV ({recordCount})
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-gray-200 bg-white p-1.5">
        <ProtocolButton active={view === "dashboard"} onClick={() => switchCanSubView("dashboard")}>
          Показатели UDS
        </ProtocolButton>
<ProtocolButton active={view === "safety"} onClick={() => switchCanSubView("safety")}>
          Подушки / Тормоза
        </ProtocolButton>
        <ProtocolButton active={view === "dtcs"} onClick={() => switchCanSubView("dtcs")}>
          Ошибки блоков
        </ProtocolButton>
        <ProtocolButton active={view === "expert"} onClick={() => switchCanSubView("expert")}>
          Сканер / Дампы
        </ProtocolButton>
        <ProtocolButton active={view === "monitor"} onClick={() => switchCanSubView("monitor")}>
          Сниффер CAN
        </ProtocolButton>
      </div>

      <div className="flex gap-2">
        <ProtocolButton active={protocol === "6"} disabled={monitoring || busy} onClick={() => setProtocol("6")}>
          CAN 11 бит / 500k
        </ProtocolButton>
        <ProtocolButton active={protocol === "7"} disabled={monitoring || busy} onClick={() => setProtocol("7")}>
          CAN 29 бит / 500k
        </ProtocolButton>
      </div>

      {volts != null && volts < 11.5 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Напряжение борта {volts.toFixed(1)} В. Для заглушённого двигателя это мало: возможны обрывы связи с блоками.
        </p>
      ) : null}

      {localError ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{localError}</p>
      ) : null}

      {view === "dashboard" ? (
        <div className="flex flex-col gap-3">
          {/* Card 1: Mitsubishi AT / CVT Telemetry (7E1 -> 7E9) */}
          <div className="rounded-xl border border-emerald-300 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-emerald-700">
                  Mitsubishi АКПП (8AT V8AWG / 5AT) и Вариатор CVT (`7E1 → 7E9` · KWP `21 02` / `21 04` / `21 03`)
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Температура масла АКПП (`°C`), текущая включенная передача (`1..8`), явный статус <strong>«Передача выключена (P/N / Автонейтраль)»</strong>, обороты входного/выходного валов и скольжение блокировки гидротрансформатора.
                </p>
              </div>
              <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                7E1 → 7E9
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readMitsuTcmOnce()}
                className="flex-1 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Прочитать АКПП / CVT (21 02 + 21 04)
              </button>
              {!mitsuTcmLive ? (
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void startMitsuTcmLive()}
                  className="rounded-xl border border-emerald-500/60 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 disabled:opacity-40"
                >
                  Живой поток АКПП
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMitsuTcmLive}
                  className="rounded-xl bg-amber-600 px-3 py-2.5 text-xs font-semibold text-white"
                >
                  Остановить поток АКПП
                </button>
              )}
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readMitsuMeterOnce()}
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-800 disabled:opacity-40"
              >
                Приборка 6A0 (Топливо в л / Пробег)
              </button>
            </div>

            {mitsuTcmData ? (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {/* ATF / CVT Temperature */}
                  <div className="rounded-lg border border-gray-200/90 bg-white p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">
                      Температура ATF / CVT
                    </div>
                    <div
                      className={`mt-1 font-mono text-2xl font-bold ${
                        mitsuTcmData.atfTempC != null && mitsuTcmData.atfTempC >= 100
                          ? "text-rose-400"
                          : mitsuTcmData.atfTempC != null && mitsuTcmData.atfTempC >= 55
                            ? "text-emerald-600"
                            : "text-blue-600"
                      }`}
                    >
                      {mitsuTcmData.atfTempC != null ? `${mitsuTcmData.atfTempC} °C` : "—"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {mitsuTcmData.atfTempC == null
                        ? "Формула F - 40"
                        : mitsuTcmData.atfTempC > 110
                          ? "ПЕРЕГРЕВ АКПП (> 110 °C)!"
                          : mitsuTcmData.atfTempC >= 96
                            ? "Высокая нагрузка (96–110 °C)"
                            : mitsuTcmData.atfTempC >= 55
                              ? "Рабочая норма (55–95 °C)"
                              : "Холодная (прогрев < 55 °C)"}
                    </div>
                  </div>

                  {/* Engaged Gear */}
                  <div className="rounded-lg border border-gray-200/90 bg-white p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">
                      Включенная передача
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-gray-900">
                      {mitsuTcmData.currentGearText}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      Селектор: <strong>{mitsuTcmData.selectorPosition}</strong>
                    </div>
                  </div>

                  {/* Disengaged / Neutral / Lock-up status */}
                  <div
                    className={`col-span-2 rounded-lg border p-2.5 sm:col-span-1 ${
                      mitsuTcmData.isGearDisengaged
                        ? "border-amber-500/50 bg-amber-950/25"
                        : "border-emerald-300 bg-emerald-50"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">
                      Состояние передачи в КПП
                    </div>
                    <div
                      className={`mt-1 text-xs font-bold ${
                        mitsuTcmData.isGearDisengaged ? "text-amber-800" : "text-emerald-700"
                      }`}
                    >
                      {mitsuTcmData.isGearDisengaged
                        ? "ПЕРЕДАЧА ВЫКЛЮЧЕНА (РАЗОМКНУТА)"
                        : "ПЕРЕДАЧА ВКЛЮЧЕНА (В ЗАЦЕПЛЕНИИ)"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-700">
                      {mitsuTcmData.disengagedStateText}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-gray-200 pt-2.5 font-mono text-xs sm:grid-cols-4">
                  <div>
                    <div className="font-sans text-[10px] text-gray-500">Первичный вал (Input)</div>
                    <div className="text-gray-800">
                      {mitsuTcmData.inputShaftRpm != null ? `${mitsuTcmData.inputShaftRpm} об/мин` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] text-gray-500">Вторичный вал (Output)</div>
                    <div className="text-gray-800">
                      {mitsuTcmData.outputShaftRpm != null ? `${mitsuTcmData.outputShaftRpm} об/мин` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] text-gray-500">Скольжение ГДТ (Slip)</div>
                    <div className="text-gray-800">
                      {mitsuTcmData.torqueConverterSlipRpm != null ? `${mitsuTcmData.torqueConverterSlipRpm} об/мин` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] text-gray-500">Питание TCM / Скорость</div>
                    <div className="text-gray-800">
                      {mitsuTcmData.controlVoltageV != null ? `${mitsuTcmData.controlVoltageV} В` : "—"} ·{" "}
                      {mitsuTcmData.vehicleSpeedKmh != null ? `${mitsuTcmData.vehicleSpeedKmh} км/ч` : "—"}
                    </div>
                  </div>
                </div>
                {mitsuTcmData.cvtDegradationCount != null ? (
                  <div className="mt-2 border-t border-gray-200 pt-1.5 text-xs text-gray-700">
                    Счётчик деградации жидкости CVT (`21 10`):{" "}
                    <strong className="font-mono text-emerald-700">{mitsuTcmData.cvtDegradationCount}</strong> ед.
                  </div>
                ) : null}
              </div>
            ) : null}

            {mitsuMeter ? (
              <div className="mt-2.5 rounded-xl border border-gray-200 bg-gray-50/90 p-2.5 text-xs">
                <div className="font-semibold text-emerald-700">
                  Приборная панель Mitsubishi (`6A0 → 514` · KWP `21 A3` / `21 AD`)
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 font-mono">
                  <div className="rounded bg-white p-2">
                    <div className="font-sans text-[10px] text-gray-500">Остаток топлива в баке (`21 A3`)</div>
                    <div className="text-base font-bold text-emerald-700">
                      {mitsuMeter.fuelLiters != null ? `${mitsuMeter.fuelLiters} л` : "нет ответа"}
                    </div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="font-sans text-[10px] text-gray-500">Одометр в приборке (`21 AD`)</div>
                    <div className="text-base font-bold text-gray-900">
                      {mitsuMeter.odometerKm != null ? `${mitsuMeter.odometerKm.toLocaleString("ru-RU")} км` : "нет ответа"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Card 2: TPMS 4+1 Wheel Map (Mitsubishi 773/600 & Subaru 752) */}
          <div className="rounded-xl border border-emerald-300 bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-emerald-700">
                  Давление и температура в шинах (TPMS Карта 4+1 с запаской)
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Mitsubishi Pajero Sport III (`773 → 774` OSS/TPMS), Outlander III / ASX (`600 → 500` KOS/TPMS) и Subaru SGP (`752 → 75A`). Поддерживается перестановка позиций колёс после шиномонтажа.
                </p>
              </div>
              <div className="flex gap-1">
                {(["bar", "kpa", "psi"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setTpmsUnit(u)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                      tpmsUnit === u
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 bg-gray-50 text-gray-500"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readTpmsOnce("mitsubishi-773")}
                className={`rounded-xl px-2.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${
                  tpmsTarget === "mitsubishi-773"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-gray-50 text-gray-800"
                }`}
              >
                Pajero Sport III (773)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readTpmsOnce("mitsubishi-600")}
                className={`rounded-xl px-2.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${
                  tpmsTarget === "mitsubishi-600"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-gray-50 text-gray-800"
                }`}
              >
                Outlander / ASX (600)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readTpmsOnce("subaru-752")}
                className={`rounded-xl px-2.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${
                  tpmsTarget === "subaru-752"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-gray-50 text-gray-800"
                }`}
              >
                Subaru SGP (752)
              </button>
            </div>

            {tpmsReport ? (
              <div className="mt-3 space-y-2">
                {tpmsReport.wheels.every((w) => w.pressureBar == null) ? (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                    Давление не пришло — выберите блок (600 Outlander / 773 Pajero Sport), IG ON, при необходимости
                    поездка &gt;30 км/ч. Raw: <span className="font-mono">{tpmsReport.rawHex || "—"}</span>
                  </p>
                ) : null}
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Блок: <strong>{tpmsReport.moduleName}</strong></span>
                  {tpmsReport.activeSet ? (
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-700">
                      Комплект шин #{tpmsReport.activeSet}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["FL", "FR", "RL", "RR", "SPARE"] as const).map((pos) => {
                    const mappedIndex = tpmsWheelMap[pos] ?? 0;
                    const wheel = tpmsReport.wheels[mappedIndex] ?? tpmsReport.wheels[0];
                    if (!wheel) return null;
                    const posNames: Record<TpmsWheelPosition, string> = {
                      FL: "Переднее левое (FL)",
                      FR: "Переднее правое (FR)",
                      RL: "Заднее левое (RL)",
                      RR: "Заднее правое (RR)",
                      SPARE: "Запасное колесо (5-й датчик)",
                    };
                    const pVal =
                      tpmsUnit === "bar"
                        ? wheel.pressureBar != null
                          ? `${wheel.pressureBar.toFixed(2)} бар`
                          : "—"
                        : tpmsUnit === "kpa"
                          ? wheel.pressureKpa != null
                            ? `${wheel.pressureKpa} кПа`
                            : "—"
                          : wheel.pressurePsi != null
                            ? `${wheel.pressurePsi.toFixed(1)} PSI`
                            : "—";
                    const lowPressure = wheel.pressureBar != null && wheel.pressureBar > 0.3 && wheel.pressureBar < 1.85;
                    return (
                      <div
                        key={pos}
                        className={`rounded-lg border p-2.5 ${
                          pos === "SPARE" ? "col-span-2" : ""
                        } ${
                          lowPressure
                            ? "border-amber-500/60 bg-amber-950/25"
                            : "border-gray-200 bg-gray-50/90"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-semibold text-gray-800">{posNames[pos]}</span>
                          <select
                            value={mappedIndex}
                            onChange={(e) => updateTpmsWheelMapping(pos, Number(e.target.value))}
                            className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-700"
                            title="Сопоставление канала датчика ЭБУ с колесом после ротации шин"
                          >
                            {[0, 1, 2, 3, 4].map((idx) => (
                              <option key={idx} value={idx}>
                                Канал #{idx + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span
                            className={`font-mono text-lg font-bold ${
                              lowPressure ? "text-amber-800" : "text-emerald-600"
                            }`}
                          >
                            {pVal}
                          </span>
                          <span className="font-mono text-xs text-gray-700">
                            {wheel.temperatureC != null ? `${wheel.temperatureC} °C` : "темп. —"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-gray-500">
                          <span>ID: {wheel.sensorIdHex ?? "—"}</span>
                          <span className="text-gray-700">{wheel.statusText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-emerald-800">
                Безопасные CAN / UDS показатели (только чтение Service 22 / A8 / 21)
              </div>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                READ-ONLY
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-700">
              Сводка полезных рабочих параметров без затрагивания подушек (SRS) и тормозов (ABS): давление в 4 шинах TPMS (`752`), температуры ДВС/КПП и каналы силовой установки (`7A2` / `7E1`), напряжение бортсети и датчики обоих полубаков (`783`), а также параметры ДВС (`7E0`).
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("subaru-tcm")}
                className="rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-2.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Subaru SGP + Шины
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("subaru")}
                className="rounded-xl border border-emerald-500/60 bg-emerald-50 px-2.5 py-2.5 text-xs font-medium text-emerald-800 disabled:opacity-40"
              >
                Subaru ДВС (7E0)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("pajero")}
                className="rounded-xl border border-gray-300 px-2.5 py-2.5 text-xs disabled:opacity-40"
              >
                Pajero 21 (7E0+7E1)
              </button>
            </div>
            {catalog.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {catalog.map((row) => (
                  <li
                    key={`${row.name}-${row.unit}`}
                    className="flex flex-col gap-0.5 rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-xs font-medium text-gray-700">{row.name}</span>
                    <span className="font-mono text-xs text-emerald-700 sm:text-right">
                      {row.value} {row.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-xs text-gray-500">
                Нажмите <strong>«Subaru SGP + Шины»</strong> или <strong>«Pajero 21 (7E0+7E1)»</strong> для мгновенного чтения параметров.
              </p>
            )}
          </div>
        </div>
      ) : view === "safety" ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-amber-300 bg-amber-950/15 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-amber-900">
                Системы безопасности: Тормоза ABS / VDC / EPB (`7B0`) и Подушки SRS Airbag (`780`)
              </span>
              <span className="shrink-0 rounded border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                STRICT READ-ONLY
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-700">
              Эти блоки вынесены отдельно. Разрешено <strong>только чтение паспорта и состояния датчиков (`Service 22`)</strong> с обязательным возвратом в штатную сессию (`10 01`). Любые команды сброса, адаптации или записи для `7B0` и `780` аппаратно заблокированы.
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readSafetyModulesOnce("all")}
                className="rounded-xl bg-amber-600 px-2.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Опросить оба блока
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readSafetyModulesOnce("abs")}
                className="rounded-xl border border-amber-500/50 bg-white px-2.5 py-2.5 text-xs font-medium text-amber-900 disabled:opacity-40"
              >
                Тормоза ABS / EPB (7B0)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void readSafetyModulesOnce("srs")}
                className="rounded-xl border border-amber-500/50 bg-white px-2.5 py-2.5 text-xs font-medium text-amber-900 disabled:opacity-40"
              >
                Подушки SRS (780)
              </button>
            </div>

            {safetyRows.length > 0 ? (
              <div className="mt-3 space-y-3">
                {(["abs", "srs"] as const).map((grp) => {
                  const items = safetyRows.filter((r) => r.group === grp);
                  if (items.length === 0) return null;
                  return (
                    <div key={grp} className="rounded-lg border border-gray-200 bg-gray-50/90 p-2.5">
                      <div className="text-xs font-semibold text-amber-800">
                        {grp === "abs"
                          ? "Тормозная система ABS / VDC / Электроручник EPB (7B0 → 7B8)"
                          : "Подушки безопасности и преднатяжители SRS Airbag (780 → 788)"}
                      </div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {items.map((item) => (
                          <li
                            key={`${grp}-${item.label}`}
                            className="flex flex-col gap-0.5 border-t border-gray-200 pt-1.5 sm:flex-row sm:justify-between"
                          >
                            <span className="text-gray-500">{item.label}</span>
                            <span className="font-mono text-gray-900 sm:text-right">{item.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : view === "dtcs" ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-700">
                Диагностика кодов ошибок (DTC) по всем блокам автомобиля
              </span>
              {busy && dtcProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-900"
                >
                  Стоп
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Опрашивает все блоки Subaru и Mitsubishi (`UDS 19 02 FF`, `KWP2000 18 00 FF 00` и `OBD Mode 03`). Для <strong>обычных блоков</strong> (ДВС `7E0`, АКПП/CVT `7E1`, Силовая `7A2`, ETACS `620`/`7A1`, Приборка `783`/`6A0`, TPMS/KOS `752`/`773`/`600`, Климат `7C4`/`688`, 4WD `7B6`, Сонары `786`/`763`) доступен безопасный сброс ошибок (`14 FF FF FF` / `14 FF 00`). Для <strong>блоков безопасности</strong> (Подушки SRS `780`/`7B2`, Тормоза ABS/ASC `7B0`/`784`, Руль EPS/SAS `746`/`622`, EyeSight `787`) разрешено <strong>только чтение</strong> без риска сбить калибровки.
            </p>

            <button
              type="button"
              disabled={hwBusy || monitoring}
              onClick={() => void runAllModuleDtcScan()}
              className="mt-2.5 w-full rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              Проверить ошибки во всех блоках ({KNOWN_MODULE_TARGETS.filter((t) => t.rx != null).length} ЭБУ)
            </button>

            {dtcProgress ? <p className="mt-2 text-xs text-emerald-700">{dtcProgress}</p> : null}
            {dtcBanner ? (
              <p className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                {dtcBanner}
              </p>
            ) : null}

            {dtcReports.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs">
                {dtcReports.map((mod) => (
                  <div
                    key={mod.txHex}
                    className={`rounded-lg border p-2.5 ${
                      !mod.responded
                        ? "border-gray-200 bg-gray-50 text-gray-500"
                        : mod.dtcs.length > 0
                          ? "border-amber-500/60 bg-amber-950/20 text-gray-900"
                          : "border-emerald-500/30 bg-gray-100 text-gray-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-semibold text-emerald-700">{mod.title}</span>
                          {mod.safetyCritical ? (
                            <span className="rounded border border-amber-300 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-900">
                              Безопасность · Только чтение
                            </span>
                          ) : (
                            <span className="rounded border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              Сброс разрешён
                            </span>
                          )}
                        </div>
                        {mod.systemName || mod.partNumber ? (
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {[mod.systemName, mod.partNumber ? `OEM ${mod.partNumber}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[11px] font-semibold ${
                          !mod.responded
                            ? "text-gray-500"
                            : mod.dtcs.length === 0
                              ? "text-emerald-600"
                              : "text-amber-800"
                        }`}
                      >
                        {mod.rawStatus}
                      </span>
                    </div>

                    {mod.dtcs.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-gray-200 pt-2">
                        {mod.dtcs.map((d) => (
                          <li key={`${mod.txHex}-${d.code}`} className="rounded bg-white/90 px-2.5 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold text-amber-800">{d.code}</span>
                              <span className="text-[10px] text-gray-500">
                                {d.active ? "Активна / подтверждена" : "В памяти (история)"}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-800">{d.description}</div>
                            {d.remedy ? (
                              <div className="mt-1 text-[10px] leading-snug text-gray-500">
                                <span className="font-semibold text-gray-500">Устранение: </span>
                                {d.remedy}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {mod.responded && mod.canSafeClear && !mod.safetyCritical ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSafeClearModuleDtc(mod)}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-gray-800 hover:border-amber-500/50 hover:text-amber-900 disabled:opacity-40"
                        >
                          Стереть ошибки в блоке {mod.txHex}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : view === "monitor" ? (
        <>
          <p className="text-xs text-gray-500">
            Пассивная прослушка шины (`ATMA` / `ATCRA`). Включает автоматический декодер широковещательных CAN-фреймов Mitsubishi & Subaru (`0x236` угол руля, `0x318` передача АКПП, `0x32F` ручник EPB, `0x214`/`0x215` скорости 4 колёс, `0x208` тормоз, `0x210` педаль газа, `0x154` топливо/пробег, `0x608` темп. ОЖ/улицы) и интерактивный Diff-охотник за кнопками.
          </p>
          <p className="text-xs text-gray-500">
            Потери адаптера: {losses}. Фильтр и протокол меняются только когда монитор остановлен.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID" value={filterId} disabled={monitoring || busy} onChange={setFilterId} />
            <Field label="Маска" value={filterMask} disabled={monitoring || busy} onChange={setFilterMask} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "236", label: "0x236 Руль SAS" },
              { id: "318", label: "0x318 АКПП / Передача" },
              { id: "32F", label: "0x32F Электроручник EPB" },
              { id: "214", label: "0x214 Колёса ABS" },
              { id: "208", label: "0x208 Тормоз" },
              { id: "154", label: "0x154 Бак / Одометр" },
              { id: "", label: "Все ID" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={monitoring || busy}
                onClick={() => {
                  setFilterId(preset.id);
                  setFilterMask(preset.id ? "7FF" : "");
                }}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 font-mono text-[11px] text-gray-700 disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={monitoring || hwBusy}
            onClick={() => void applyFilter()}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:opacity-40"
          >
            Применить фильтр
          </button>
          <button
            type="button"
            disabled={hwBusy}
            onClick={() => void (monitoring ? stopMonitor() : startMonitor())}
            className="rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-3 text-sm font-medium text-white disabled:bg-gray-400 disabled:border-gray-400"
          >
            {monitoring ? "Остановить монитор" : "Слушать шину"}
          </button>

          {/* Interactive CAN Diff-Sniffer (Button & Event Hunter) */}
          <div className="rounded-xl border border-emerald-300 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-700">
                Интерактивный CAN Diff-Sniffer («Охотник за кнопками и событиями»)
              </span>
              {canBaseline ? (
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-700">
                  Фон: {canBaseline.length} ID
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              1. Нажмите <strong>«Запомнить фон»</strong> в покое. 2. Нажмите кнопку в салоне или переключите рычаг. 3. Нажмите <strong>«Найти изменения»</strong> — отобразятся только изменившиеся байты и биты.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={captureCanBaseline}
                className="rounded-xl border border-emerald-500/60 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-40"
              >
                1. Запомнить фон ({rows.length} ID)
              </button>
              <button
                type="button"
                disabled={!canBaseline}
                onClick={compareCanAction}
                className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                2. Найти изменения (Diff)
              </button>
            </div>
            {canDiffResult ? (
              <div className="mt-2.5 border-t border-gray-200 pt-2 text-xs">
                <div className="text-[11px] text-gray-700">
                  Изменилось CAN ID: <strong>{canDiffResult.length}</strong>
                </div>
                {canDiffResult.length > 0 ? (
                  <ul className="mt-1.5 space-y-1.5 font-mono text-[11px]">
                    {canDiffResult.map((diff) => (
                      <li
                        key={diff.idHex}
                        className="rounded border border-amber-300 bg-amber-950/20 p-2 text-gray-800"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-amber-800">0x{diff.idHex}</span>
                          <span className="text-[10px] text-gray-500">
                            байты [{diff.changedByteIndices.join(", ")}]
                            {diff.decodedHint ? ` · ${diff.decodedHint}` : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 text-gray-500">Было: {diff.beforeHex}</div>
                        <div className="text-emerald-700">Стало: {diff.afterHex}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-500">Изменений относительно фона не обнаружено.</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Live Decoded Broadcast Signals */}
          {rows.some((r) => decodeCanBroadcastFrame(r.id, r.data)) ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-950/15 p-3">
              <div className="text-xs font-semibold text-emerald-700">
                Живая расшифровка широковещательных CAN-фреймов (DBC Live Decoder)
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {rows
                  .map((r) => decodeCanBroadcastFrame(r.id, r.data))
                  .filter((sig): sig is DecodedBroadcastSignal => sig !== null)
                  .map((sig) => (
                    <div
                      key={sig.idHex}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/90 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono text-[11px] text-gray-500">
                        <strong className="text-emerald-600">0x{sig.idHex}</strong> · {sig.title}
                      </span>
                      <span className="font-mono font-semibold text-gray-900">{sig.summary}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const next = !recording;
                recordingRef.current = next;
                setRecording(next);
                if (next) {
                  recordsRef.current = [];
                  setRecordCount(0);
                  setIncomplete(false);
                }
              }}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:opacity-40"
            >
              {recording ? "Стоп записи" : "Запись"}
            </button>
            <button
              type="button"
              disabled={recordCount === 0}
              onClick={() => void exportCapture()}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:opacity-40"
            >
              CSV ({recordCount})
            </button>
          </div>
          {recordCount >= RECORD_LIMIT ? (
            <p className="text-xs text-amber-900">Достигнут лимит {RECORD_LIMIT} кадров.</p>
          ) : null}
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!recording}
              onClick={addNote}
              className="rounded-lg border border-gray-300 px-3 text-sm disabled:opacity-40"
            >
              Метка
            </button>
          </div>
          <div className="max-w-full overflow-x-clip rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Кадр</th>
                  <th className="px-2 py-2">Счёт</th>
                  <th className="px-2 py-2">мс</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200">
                    <td className="px-2 py-2 font-mono">{row.id}</td>
                    <td className="break-all px-2 py-2 font-mono text-[10px] leading-snug">
                      {row.data.map((byte, index) => (
                        <span key={`${row.id}-${index}`} className={row.changed[index] ? "text-amber-800" : ""}>
                          {byte.toString(16).padStart(2, "0").toUpperCase()}{" "}
                        </span>
                      ))}
                    </td>
                    <td className="px-2 py-2">{row.count}</td>
                    <td className="px-2 py-2">{row.periodMs ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="max-h-48 overflow-x-clip break-all rounded-md bg-gray-100 p-2 text-xs text-gray-500">
            {tape.join("\n")}
          </pre>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-700">Заводские таблицы (1 нажатие)</div>
            <p className="mt-1 text-xs text-gray-500">
              Subaru ДВС (`7E0` SSM `A8`), Subaru SGP (`7E1` КПП + `7A2` 2.4 TURBO + `752` Шины TPMS + `783` Приборка), Pajero Sport (`7E0` `21 01–04`).
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("subaru")}
                className="rounded-xl border border-gray-900 bg-gray-900 px-2.5 py-2.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Subaru ДВС (7E0)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("subaru-tcm")}
                className="rounded-xl border border-emerald-500/60 bg-emerald-50 px-2.5 py-2.5 text-xs font-medium text-emerald-800 disabled:opacity-40"
              >
                Subaru SGP + Шины
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runCatalog("pajero")}
                className="rounded-xl border border-gray-300 px-2.5 py-2.5 text-xs disabled:opacity-40"
              >
                Pajero 21 (7E0)
              </button>
            </div>
            {catalog.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {catalog.map((row) => (
                  <li
                    key={`${row.name}-${row.unit}`}
                    className="flex justify-between gap-2 rounded-md bg-gray-100 px-3 py-2"
                  >
                    <span>{row.name}</span>
                    <span className="font-mono text-gray-800">
                      {row.value} {row.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-800">
                Subaru SGP: Полное чтение КПП (7E1) + Приборки (783) + EyeSight (787) + Климата (7C4)
              </span>
              {busy && subaruProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-900"
                >
                  Стоп
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-gray-700">
              Строго <strong>только чтение (`Service 22 ReadDataByIdentifier`)</strong> — автоматически читает битовые маски (`1000`, `1020`, `1100`, `2100`, `3000`) и выгружает все открытые DID Коробки CVT (`7E1`), Приборки (`783`), EyeSight (`787`), Климата (`7C4`), Сонаров (`786`) и Шлюза (`750`). Без единой команды записи (`2E`) или сброса (`11`).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void runSubaruRegionDump()}
                className="flex-1 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Полное чтение по битовым картам (7E1 / 783 / 787 / 7C4 / 786)
              </button>
              {subaruDump ? (
                <button
                  type="button"
                  onClick={() => void exportSubaruDump()}
                  className="rounded-xl border border-emerald-400/60 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-800"
                >
                  Скачать дамп (.json)
                </button>
              ) : null}
            </div>
            {subaruProgress ? (
              <p className="mt-1.5 text-xs text-emerald-700">{subaruProgress}</p>
            ) : null}
            {(subaruDump?.modules ?? subaruPartial).length > 0 ? (
              <div className="mt-2.5 space-y-2 text-xs">
                {(subaruDump?.modules ?? subaruPartial).map((mod) => (
                  <div
                    key={mod.txHex}
                    className={`rounded-lg border p-2.5 ${
                      mod.responded
                        ? "border-emerald-300 bg-gray-50/90 text-gray-900"
                        : "border-gray-200 bg-gray-50 text-gray-500"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-emerald-700">
                        {mod.title}
                      </span>
                      <span className="text-[11px]">
                        {mod.responded ? `Ответил (${mod.dids.length} DID)` : "Нет ответа"}
                      </span>
                    </div>
                    {mod.responded ? (
                      <>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-700">
                          {mod.systemName ? <span>Система: <strong>{mod.systemName}</strong></span> : null}
                          {mod.partNumber ? <span>Деталь OEM: <strong>{mod.partNumber}</strong></span> : null}
                          {mod.softwareVersion ? <span>Софт: <strong>{mod.softwareVersion}</strong></span> : null}
                          {mod.calId ? <span>CalID: <strong>{mod.calId}</strong></span> : null}
                        </div>
                        {mod.dids.length > 0 ? (
                          <ul className="mt-1.5 space-y-1 border-t border-gray-200 pt-1.5 font-mono text-[11px]">
                            {mod.dids.map((item) => (
                              <li key={`${mod.txHex}-${item.did}`} className="text-gray-700">
                                <span className="text-emerald-600">22 {item.did}</span> · {item.decoded}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-100 p-2.5 text-xs">
              <div className="font-semibold text-emerald-800">
                Сравнение двух дампов (.json Diff: Было → Стало)
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Загрузите два сохранённых `.json` файла (например, на `P` и на `D`, или с холодным/прогретым КПП), чтобы увидеть только изменившиеся DID по всем блокам.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700">
                  <span>Дамп 1 (Было): {diffDumpA ? <strong>{diffDumpA.name}</strong> : "не выбран"}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void loadSubaruDumpFile("A", e.target.files?.[0] ?? null)}
                    className="text-[11px] text-gray-500"
                  />
                </label>
                <label className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700">
                  <span>Дамп 2 (Стало): {diffDumpB ? <strong>{diffDumpB.name}</strong> : "не выбран"}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void loadSubaruDumpFile("B", e.target.files?.[0] ?? null)}
                    className="text-[11px] text-gray-500"
                  />
                </label>
              </div>
              {subaruDump ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextA = { name: `Текущий (${subaruDump.capturedAt.slice(11, 19)})`, dump: subaruDump };
                      setDiffDumpA(nextA);
                      if (diffDumpB) setDiffRows(diffSubaruDumps(nextA.dump, diffDumpB.dump));
                    }}
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700"
                  >
                    Взять текущий скан как «Было»
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextB = { name: `Текущий (${subaruDump.capturedAt.slice(11, 19)})`, dump: subaruDump };
                      setDiffDumpB(nextB);
                      if (diffDumpA) setDiffRows(diffSubaruDumps(diffDumpA.dump, nextB.dump));
                    }}
                    className="rounded-lg border border-emerald-500/50 px-2.5 py-1 text-[11px] text-emerald-800"
                  >
                    Взять текущий скан как «Стало»
                  </button>
                </div>
              ) : null}
              {diffRows != null ? (
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <div className="text-[11px] text-gray-700">
                    Найдено изменившихся параметров: <strong>{diffRows.length}</strong>
                  </div>
                  {diffRows.length > 0 ? (
                    <ul className="mt-1.5 space-y-1.5 font-mono text-[11px]">
                      {diffRows.map((d) => (
                        <li
                          key={`${d.txHex}-${d.did}`}
                          className="rounded border border-amber-300 bg-amber-950/20 p-2 text-gray-800"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-amber-800">
                              [{d.txHex}] 22 {d.did} · {d.moduleTitle}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setTx(d.txHex);
                                toggleWatchedDid(d.did);
                              }}
                              className="rounded border border-emerald-500/60 bg-emerald-900/40 px-2 py-0.5 font-sans text-[10px] text-emerald-800"
                            >
                              + В Live ({d.txHex})
                            </button>
                          </div>
                          <div className="mt-0.5 text-gray-500">Было: {d.beforeDecoded}</div>
                          <div className="text-emerald-700">Стало: {d.afterDecoded}</div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700">Поиск блоков на шине CAN</span>
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-900"
                >
                  Стоп
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Будит все блоки (`3E 00` → `10 03` → `09 04`), автоматически читает их заводской номер (`F18E`) и имя системы (`F197`), а после опроса закрывает сессию (`10 01`), чтобы на приборке сразу гасли лампы ABS/VDC.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void scan("3E 00", "extended")}
                className="col-span-2 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                Полный опрос всех блоков (как в Launch: ДВС, CVT, ABS, SRS, Климат, Кузов)
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void scan("3E 00", "standard")}
                className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium disabled:opacity-40"
              >
                Быстрый 7E0–7DF
              </button>
              <button
                type="button"
                disabled={hwBusy || monitoring}
                onClick={() => void scan("3E 00", "wide")}
                className="rounded-xl border border-amber-500/50 bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-900 disabled:opacity-40"
              >
                Полный перебор 700–7E7
              </button>
            </div>
            {scanRows.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-xs">
                {scanRows.map((row) => (
                  <li
                    key={row.address}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                      row.responded
                        ? "border border-emerald-300 bg-emerald-50 text-gray-900"
                        : "bg-gray-50 text-gray-500"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-medium">
                        {row.address} · <span className="font-sans text-gray-700">{row.name}</span>
                      </div>
                      <div className="truncate text-gray-500">{row.detail}</div>
                    </div>
                    {row.responded ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTx(row.txHex);
                          setRx(row.rxHex);
                        }}
                        className="shrink-0 rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        Выбрать {row.txHex}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-700">Ручной запрос к блоку</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KNOWN_MODULE_TARGETS.filter((t) => t.rx != null).map((target) => {
                const txHex = target.tx.toString(16).toUpperCase();
                const rxHex = target.rx!.toString(16).toUpperCase();
                const active = tx.toUpperCase() === txHex && rx.toUpperCase() === rxHex;
                return (
                  <button
                    key={`${txHex}-${rxHex}`}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTx(txHex);
                      setRx(rxHex);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      active
                        ? "border-emerald-500 bg-emerald-100 text-emerald-800"
                        : "border-gray-300 text-gray-500"
                    }`}
                  >
                    {txHex} {target.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Адрес запроса (TX)" value={tx} disabled={busy} onChange={setTx} />
              <Field label="Адрес ответа (RX)" value={rx} disabled={busy} onChange={setRx} />
            </div>
            <div className="mt-2">
              <Field label="Команда (hex)" value={request} disabled={busy} onChange={setRequest} />
            </div>
            <button
              type="button"
              disabled={hwBusy}
              onClick={() => void sendRequest(request)}
              className="mt-2 w-full rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-3 text-sm font-medium text-white disabled:bg-gray-400 disabled:border-gray-400"
            >
              Отправить
            </button>

            {udsText ? (
              <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs">
                <div className="text-gray-500">Ответ блока:</div>
                <p className="mt-0.5 break-all font-mono text-sm text-emerald-700">{udsText}</p>
                {udsRaw && udsRaw !== udsText ? (
                  <p className="mt-1 break-all font-mono text-[11px] text-gray-500">Сырой ответ: {udsRaw}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {UDS_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={hwBusy}
                  onClick={() => {
                    setRequest(item.hex);
                    void sendRequest(item.hex);
                  }}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 disabled:opacity-40"
                >
                  {item.label} ({item.hex})
                </button>
              ))}
              {customDids.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={hwBusy}
                  onClick={() => {
                    setRequest(item.hex);
                    void sendRequest(item.hex);
                  }}
                  className="rounded-lg border border-emerald-700/60 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={didLabel}
                placeholder="Сохранить текущую команду как кнопку…"
                onChange={(event) => setDidLabel(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={saveDid}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs"
              >
                Сохранить
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-700">
                  Поиск датчиков и паспорта выбранного блока ({tx})
                </span>
                {busy && !liveUdsRunning ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopScanRef.current = true;
                    }}
                    className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-900"
                  >
                    Стоп
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Открывает сессию `10 03`, удерживает её через `3E 00`, находит рабочие DID на блоке (например CVT `7E1` или ABS `7B0`) и в конце отправляет `10 01`, чтобы погасить лампы на панели.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0xf180, to: 0xf1ff, label: "F180–F1FF", stopOnSilence: true })}
                  className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-medium disabled:opacity-40"
                >
                  Паспорт (F180–F1FF)
                </button>
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0x1000, to: 0x107f, label: "1000–107F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800 disabled:opacity-40"
                >
                  Датчики 1000–107F
                </button>
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0x1100, to: 0x117f, label: "1100–117F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800 disabled:opacity-40"
                >
                  Датчики 1100–117F
                </button>
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0x2000, to: 0x207f, label: "2000–207F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800 disabled:opacity-40"
                >
                  Датчики 2000–207F
                </button>
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0x2100, to: 0x217f, label: "2100–217F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800 disabled:opacity-40"
                >
                  Датчики 2100–217F
                </button>
                <button
                  type="button"
                  disabled={hwBusy || monitoring}
                  onClick={() => void scanDids({ from: 0xd000, to: 0xd07f, label: "D000–D07F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800 disabled:opacity-40"
                >
                  Датчики D000–D07F
                </button>
              </div>
              {didProgress ? (
                <p className="mt-1.5 text-xs text-gray-500">
                  Проверено DID: {didProgress} · найдено ответов: {didHits.length}
                </p>
              ) : null}
              {didHits.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {didHits.map((row) => {
                    const inWatch = watchedDids.includes(row.did);
                    return (
                      <li
                        key={row.did}
                        className="flex items-start justify-between gap-2 rounded-md bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-emerald-600">22 {row.did}</span>
                          <div className="break-all font-mono text-gray-800">{row.text}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleWatchedDid(row.did)}
                          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${
                            inWatch
                              ? "bg-gray-900 text-white"
                              : "border border-gray-300 text-gray-700"
                          }`}
                        >
                          {inWatch ? "В Live ✓" : "+ В Live"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-800">
                  Live-монитор UDS (поток данных блока {tx} как в Launch)
                </span>
                <button
                  type="button"
                  disabled={hwBusy && !liveUdsRunning}
                  onClick={() => void sendRequest("10 01")}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-gray-800 disabled:opacity-40"
                >
                  Погасить лампы (10 01)
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Непрерывно опрашивает выбранные DID (`22 XXXX`) с удержанием сессии `10 03` / `3E 00`. Переключайте селектор КПП (`P-R-N-D`), нажимайте тормоз или газ — изменившиеся параметры подсветятся жёлтым.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {watchedDids.map((did) => (
                  <button
                    key={did}
                    type="button"
                    disabled={liveUdsRunning}
                    onClick={() => toggleWatchedDid(did)}
                    className="rounded-md border border-emerald-500/50 bg-emerald-900/40 px-2 py-1 font-mono text-xs text-emerald-100 disabled:opacity-60"
                  >
                    22 {did} ×
                  </button>
                ))}
                <button
                  type="button"
                  disabled={liveUdsRunning}
                  onClick={() => toggleWatchedDid(request)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-40"
                >
                  + Добавить текущую команду ({request})
                </button>
              </div>
              <div className="mt-2.5 flex gap-2">
                {!liveUdsRunning ? (
                  <button
                    type="button"
                    disabled={hwBusy || monitoring || watchedDids.length === 0}
                    onClick={() => void startLiveUds()}
                    className="flex-1 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Запустить Live-поток ({watchedDids.length} DID)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveUds}
                    className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white"
                  >
                    Остановить Live-поток (и погасить лампы 10 01)
                  </button>
                )}
              </div>
              {liveUdsRows.length > 0 ? (
                <ul className="mt-2.5 space-y-1.5 text-xs">
                  {liveUdsRows.map((row) => (
                    <li
                      key={row.did}
                      className={`rounded-lg border px-3 py-2 ${
                        row.changed
                          ? "border-amber-400/60 bg-amber-50"
                          : "border-gray-200 bg-gray-50/90"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-emerald-700">22 {row.did}</span>
                        <div className="flex items-center gap-1.5">
                          {row.changed ? (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              ИЗМЕНИЛСЯ
                            </span>
                          ) : null}
                          <span className="font-mono text-[11px] text-gray-500">#{row.count}</span>
                        </div>
                      </div>
                      <div className="mt-0.5 break-all font-mono text-gray-900">{row.text}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={developer}
                onChange={(event) => {
                  if (!event.target.checked) {
                    setDeveloper(false);
                    return;
                  }
                  const confirmed = window.confirm(
                    "Режим разработчика разрешает сервисы записи, сброса и программирования. Случайная команда может нарушить работу блока. Включить только до обновления страницы?",
                  );
                  if (confirmed) setDeveloper(true);
                }}
              />
              Режим разработчика (разрешить команды записи до перезагрузки страницы)
            </label>
          </div>

          <button
            type="button"
            disabled={udsLog.length === 0}
            onClick={() =>
              void saveBlobToDevice(
                new Blob([exportUdsLog(udsLog)], { type: "text/csv" }),
                "uds-log.csv",
              )
            }
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:opacity-40"
          >
            Экспорт журнала UDS ({udsLog.length})
          </button>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-gray-500">
      {label}
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 disabled:opacity-40"
      />
    </label>
  );
}

function ProtocolButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium ${
        active ? "bg-gray-900 text-white" : "text-gray-500"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
