"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
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
  type UdsLogEntry,
  appendUdsLog,
  assessUdsRequest,
  exportUdsLog,
  formatUdsPayload,
  loadCustomDids,
  loadUdsLog,
  saveCustomDids,
} from "@/lib/obd/uds";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import { EXTENDED_COMMANDS, decodeExtendedSignals, type DecodedSignal } from "@/lib/obd/extended-signals";

const RECORD_LIMIT = 50_000;
const TAPE_LIMIT = 40;

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
  isScrollingRef,
  scrollFlushRef,
}: {
  session: ObdBleSession;
  enabled: boolean;
  linkLostTick: number;
  onLog: (line: string) => void;
  isScrollingRef?: RefObject<boolean>;
  scrollFlushRef?: RefObject<(() => void) | null>;
}) {
  const [protocol, setProtocol] = useState<CanProtocol>("6");
  const [view, setView] = useState<"monitor" | "uds">("uds");
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
  const [customDids, setCustomDids] = useState<CustomDid[]>([]);
  const [didLabel, setDidLabel] = useState("");
  const [udsText, setUdsText] = useState<string | null>(null);
  const [udsRaw, setUdsRaw] = useState<string | null>(null);
  const [udsLog, setUdsLog] = useState<UdsLogEntry[]>([]);
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
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const stopScanRef = useRef(false);
  const stopLiveUdsRef = useRef(false);
  const recordsRef = useRef<CsvRow[]>([]);
  const recordingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const rowsRef = useRef<FrameRow[]>([]);
  const tapeRef = useRef<string[]>([]);
  const pendingUiRef = useRef(false);

  const flushDeferredUi = useCallback(() => {
    if (!pendingUiRef.current) return;
    pendingUiRef.current = false;
    setRows([...rowsRef.current]);
    setTape([...tapeRef.current]);
  }, []);

  useEffect(() => {
    if (!scrollFlushRef) return;
    scrollFlushRef.current = flushDeferredUi;
    return () => {
      if (scrollFlushRef.current === flushDeferredUi) scrollFlushRef.current = null;
    };
  }, [flushDeferredUi, scrollFlushRef]);

  useEffect(() => {
    tapeRef.current = tape;
  }, [tape]);

  useEffect(() => {
    setCustomDids(loadCustomDids());
    setUdsLog(loadUdsLog());
  }, []);

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
    setMonitoring(false);
    if (recordingRef.current) setIncomplete(true);
    recordingRef.current = false;
    setRecording(false);
    setLocalError("Связь с адаптером прервалась. Запись помечена как незавершённая. Подключите vLinker снова.");
  }, [linkLostTick]);

  useEffect(() => {
    if (enabled) return;
    setMonitoring(false);
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
        if (isScrollingRef?.current) {
          pendingUiRef.current = true;
        } else {
          setRows(faded);
        }
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
      if (isScrollingRef?.current) {
        pendingUiRef.current = true;
      } else {
        setRows(next);
        if (tapeAdd.length) setTape(tapeRef.current);
      }
      if (lossAdd) setLosses((count) => count + lossAdd);
      if (recordingRef.current) setRecordCount(recordsRef.current.length);
    }, 100);
    return () => window.clearInterval(id);
  }, [onLog, protocol]);

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
          ? formatUdsPayload(result.parsed.payload, result.parsed.sid)
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
      let ssmSuccessCount = 0;
      for (const command of EXTENDED_COMMANDS.filter((item) => item.group === group)) {
        try {
          const result = await session.sendUds("6", command.tx, command.rx, command.hex, false);
          if (result.parsed.kind === "positive") {
            ssmSuccessCount += 1;
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

      // On 6th-gen Subaru SGP (Outback BT / Legacy BW 2020+), legacy SSM A8 is disabled on TCM (7E1).
      // Automatically switch to UDS (10 03 + 09 04 + 22 bitmaps 1000/1020/1100/2100/F18E/F197) and read all supported CVT DIDs!
      if (group === "subaru-tcm" && ssmSuccessCount === 0) {
        const udsRows: DecodedSignal[] = [];
        try {
          const res09 = await session.sendUds("6", "7E1", "7E9", "09 04", false);
          if (res09.parsed.kind === "positive") {
            udsRows.push({
              name: "Калибровка КПП (09 04)",
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
              name: "Ошибки КПП (Mode 03)",
              value: dtcCount === 0 ? "0 ошибок" : `${dtcCount} шт.`,
              unit: "",
            });
            setCatalog([...udsRows]);
          }
        } catch {
          /* ignore */
        }

        let sessionOpened = false;
        try {
          const res10 = await session.sendUds("6", "7E1", "7E9", "10 03", false);
          if (res10.parsed.kind === "positive") sessionOpened = true;
        } catch {
          /* ignore */
        }

        const queue: number[] = [
          0xf18e, 0xf197, 0xf189, 0xf182, 0x1000, 0x1100, 0x2000, 0x2100, 0x3000, 0xd000,
        ];
        const visited = new Set<number>();
        while (queue.length > 0 && visited.size < 48) {
          const didNum = queue.shift()!;
          if (visited.has(didNum)) continue;
          visited.add(didNum);
          const didHex = didNum.toString(16).padStart(4, "0").toUpperCase();
          try {
            const res22 = await session.sendUds("6", "7E1", "7E9", `22 ${didHex}`, false);
            if (res22.parsed.kind === "positive") {
              const body =
                res22.parsed.payload.length >= 2 &&
                res22.parsed.payload[0] === ((didNum >> 8) & 0xff) &&
                res22.parsed.payload[1] === (didNum & 0xff)
                  ? res22.parsed.payload.slice(2)
                  : res22.parsed.payload;
              udsRows.push({
                name: `UDS 22 ${didHex}`,
                value: formatUdsPayload(res22.parsed.payload, 0x22),
                unit: "",
              });
              setCatalog([...udsRows]);
              if (didNum >= 0x1000 && didNum < 0xf180 && (didNum & 0x1f) === 0 && body.length === 4) {
                for (let i = 0; i < 32; i++) {
                  const byteIdx = i >> 3;
                  const bitMask = 1 << (7 - (i & 7));
                  if ((body[byteIdx]! & bitMask) !== 0) {
                    const child = didNum + i + 1;
                    if (!visited.has(child)) queue.push(child);
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (sessionOpened) {
          try {
            await session.sendUds("6", "7E1", "7E9", "10 01", false);
          } catch {
            /* ignore */
          }
        }

        if (udsRows.length > 0) {
          setCatalog(udsRows);
        } else {
          setCatalog([
            ...rows,
            {
              name: "Подсказка для Subaru SGP (2020+)",
              value:
                "На SGP старый протокол SSM (A8) в TCM 7E1 отключён. Нажмите «Полное чтение по битовым картам» ниже или «Поиск датчиков 1000–107F» для 7E1.",
              unit: "",
            },
          ]);
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
          setSubaruProgress(status);
          setSubaruPartial(partial);
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
          setDidProgress(`${done} / ${total}`);
          if (hit) {
            setDidHits((prev) => [...prev, hit]);
            setWatchedDids((prev) => {
              if (prev.includes(hit.did) || prev.length >= 12) return prev;
              return [...prev, hit.did];
            });
          }
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
              const text = formatUdsPayload(res.parsed.payload, res.parsed.sid);
              if (isScrollingRef?.current) continue;
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

  if (!enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-400">Сначала подключите адаптер сверху.</p>
        {localError ? <p className="text-sm text-red-200">{localError}</p> : null}
        {recordCount > 0 ? (
          <button
            type="button"
            onClick={() => void exportCapture()}
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm"
          >
            CSV ({recordCount})
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex rounded-xl border border-slate-800 bg-slate-900/50 p-1">
        <ProtocolButton
          active={view === "uds"}
          onClick={() => {
            void (async () => {
              if (monitoring) await stopMonitor();
              setView("uds");
            })();
          }}
        >
          Запросы к блокам (UDS / SSM / KWP)
        </ProtocolButton>
        <ProtocolButton active={view === "monitor"} onClick={() => setView("monitor")}>
          Прослушка шины (ATMA)
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
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Напряжение борта {volts.toFixed(1)} В. Для заглушённого двигателя это мало: возможны обрывы связи с блоками.
        </p>
      ) : null}

      {localError ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{localError}</p>
      ) : null}

      {view === "monitor" ? (
        <>
          <p className="text-xs text-slate-400">
            Пассивная прослушка шины (`ATMA`). На машинах с межсетевым шлюзом (Gateway) в разъёме OBD-II тишина, пока не идёт опрос. Для чтения параметров и блоков используйте вкладку «Запросы к блокам».
          </p>
          <p className="text-xs text-slate-500">
            Потери адаптера: {losses}. Фильтр и протокол меняются только когда монитор остановлен.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID" value={filterId} disabled={monitoring || busy} onChange={setFilterId} />
            <Field label="Маска" value={filterMask} disabled={monitoring || busy} onChange={setFilterMask} />
          </div>
          <button
            type="button"
            disabled={monitoring || busy}
            onClick={() => void applyFilter()}
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm disabled:opacity-40"
          >
            Применить фильтр
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void (monitoring ? stopMonitor() : startMonitor())}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:bg-slate-700"
          >
            {monitoring ? "Остановить монитор" : "Слушать шину"}
          </button>
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
              className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm disabled:opacity-40"
            >
              {recording ? "Стоп записи" : "Запись"}
            </button>
            <button
              type="button"
              disabled={recordCount === 0}
              onClick={() => void exportCapture()}
              className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm disabled:opacity-40"
            >
              CSV ({recordCount})
            </button>
          </div>
          {recordCount >= RECORD_LIMIT ? (
            <p className="text-xs text-amber-200">Достигнут лимит {RECORD_LIMIT} кадров.</p>
          ) : null}
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!recording}
              onClick={addNote}
              className="rounded-lg border border-slate-600 px-3 text-sm disabled:opacity-40"
            >
              Метка
            </button>
          </div>
          <div className="max-w-full overflow-x-clip rounded-lg border border-slate-800">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Кадр</th>
                  <th className="px-2 py-2">Счёт</th>
                  <th className="px-2 py-2">мс</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="px-2 py-2 font-mono">{row.id}</td>
                    <td className="break-all px-2 py-2 font-mono text-[10px] leading-snug">
                      {row.data.map((byte, index) => (
                        <span key={`${row.id}-${index}`} className={row.changed[index] ? "text-amber-300" : ""}>
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
          <pre className="max-h-40 overflow-y-auto overflow-x-clip overscroll-y-contain break-all rounded-md bg-black/40 p-2 text-xs text-slate-400">
            {tape.join("\n")}
          </pre>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-300">Заводские таблицы (1 нажатие)</div>
            <p className="mt-1 text-xs text-slate-500">
              Subaru ДВС (`7E0` SSM `A8`), Subaru КПП (`7E1` SSM `A8` + автопереход на UDS `22` / `09 04` для 6-го поколения SGP). Pajero Sport — таблицы `21 01–04` (`7E0`).
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runCatalog("subaru")}
                className="rounded-xl bg-emerald-600/90 px-2.5 py-2.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Subaru ДВС (7E0)
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runCatalog("subaru-tcm")}
                className="rounded-xl border border-emerald-500/60 bg-emerald-950/40 px-2.5 py-2.5 text-xs font-medium text-emerald-200 disabled:opacity-40"
              >
                Subaru КПП (7E1)
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runCatalog("pajero")}
                className="rounded-xl border border-slate-600 px-2.5 py-2.5 text-xs disabled:opacity-40"
              >
                Pajero 21 (7E0)
              </button>
            </div>
            {catalog.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {catalog.map((row) => (
                  <li
                    key={`${row.name}-${row.unit}`}
                    className="flex justify-between gap-2 rounded-md bg-slate-950/80 px-3 py-2"
                  >
                    <span>{row.name}</span>
                    <span className="font-mono text-slate-200">
                      {row.value} {row.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-200">
                Subaru SGP: Полное чтение КПП (7E1) + Приборки (783) + EyeSight (787) + Климата (7C4)
              </span>
              {busy && subaruProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-200"
                >
                  Стоп
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              Строго <strong>только чтение (`Service 22 ReadDataByIdentifier`)</strong> — автоматически читает битовые маски (`1000`, `1020`, `1100`, `2100`, `3000`) и выгружает все открытые DID Коробки CVT (`7E1`), Приборки (`783`), EyeSight (`787`), Климата (`7C4`), Сонаров (`786`) и Шлюза (`750`). Без единой команды записи (`2E`) или сброса (`11`).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runSubaruRegionDump()}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Полное чтение по битовым картам (7E1 / 783 / 787 / 7C4 / 786)
              </button>
              {subaruDump ? (
                <button
                  type="button"
                  onClick={() => void exportSubaruDump()}
                  className="rounded-xl border border-emerald-400/60 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-emerald-200"
                >
                  Скачать дамп (.json)
                </button>
              ) : null}
            </div>
            {subaruProgress ? (
              <p className="mt-1.5 text-xs text-emerald-300">{subaruProgress}</p>
            ) : null}
            {(subaruDump?.modules ?? subaruPartial).length > 0 ? (
              <div className="mt-2.5 space-y-2 text-xs">
                {(subaruDump?.modules ?? subaruPartial).map((mod) => (
                  <div
                    key={mod.txHex}
                    className={`rounded-lg border p-2.5 ${
                      mod.responded
                        ? "border-emerald-500/40 bg-slate-950/90 text-slate-100"
                        : "border-slate-800 bg-slate-950/50 text-slate-500"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-emerald-300">
                        {mod.title}
                      </span>
                      <span className="text-[11px]">
                        {mod.responded ? `Ответил (${mod.dids.length} DID)` : "Нет ответа"}
                      </span>
                    </div>
                    {mod.responded ? (
                      <>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
                          {mod.systemName ? <span>Система: <strong>{mod.systemName}</strong></span> : null}
                          {mod.partNumber ? <span>Деталь OEM: <strong>{mod.partNumber}</strong></span> : null}
                          {mod.softwareVersion ? <span>Софт: <strong>{mod.softwareVersion}</strong></span> : null}
                          {mod.calId ? <span>CalID: <strong>{mod.calId}</strong></span> : null}
                        </div>
                        {mod.dids.length > 0 ? (
                          <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto border-t border-slate-800 pt-1.5 font-mono text-[11px]">
                            {mod.dids.map((item) => (
                              <li key={`${mod.txHex}-${item.did}`} className="text-slate-300">
                                <span className="text-emerald-400">22 {item.did}</span> · {item.decoded}
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
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">Поиск блоков на шине CAN</span>
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScanRef.current = true;
                  }}
                  className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-200"
                >
                  Стоп
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Будит все блоки (`3E 00` → `10 03` → `09 04`), автоматически читает их заводской номер (`F18E`) и имя системы (`F197`), а после опроса закрывает сессию (`10 01`), чтобы на приборке сразу гасли лампы ABS/VDC.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("3E 00", "extended")}
                className="col-span-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                Полный опрос всех блоков (как в Launch: ДВС, CVT, ABS, SRS, Климат, Кузов)
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("3E 00", "standard")}
                className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-medium disabled:opacity-40"
              >
                Быстрый 7E0–7DF
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("3E 00", "wide")}
                className="rounded-xl border border-amber-500/50 bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-200 disabled:opacity-40"
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
                        ? "border border-emerald-500/40 bg-emerald-950/30 text-slate-100"
                        : "bg-slate-950/60 text-slate-400"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-medium">
                        {row.address} · <span className="font-sans text-slate-300">{row.name}</span>
                      </div>
                      <div className="truncate text-slate-400">{row.detail}</div>
                    </div>
                    {row.responded ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTx(row.txHex);
                          setRx(row.rxHex);
                        }}
                        className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        Выбрать {row.txHex}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-300">Ручной запрос к блоку</div>
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
                        ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                        : "border-slate-700 text-slate-400"
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
              disabled={busy}
              onClick={() => void sendRequest(request)}
              className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:bg-slate-700"
            >
              Отправить
            </button>

            {udsText ? (
              <div className="mt-2 rounded-lg bg-slate-950 p-2.5 text-xs">
                <div className="text-slate-400">Ответ блока:</div>
                <p className="mt-0.5 break-all font-mono text-sm text-emerald-300">{udsText}</p>
                {udsRaw && udsRaw !== udsText ? (
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">Сырой ответ: {udsRaw}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {UDS_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRequest(item.hex);
                    void sendRequest(item.hex);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 disabled:opacity-40"
                >
                  {item.label} ({item.hex})
                </button>
              ))}
              {customDids.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRequest(item.hex);
                    void sendRequest(item.hex);
                  }}
                  className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1.5 text-xs text-emerald-200 disabled:opacity-40"
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
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={saveDid}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs"
              >
                Сохранить
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-300">
                  Поиск датчиков и паспорта выбранного блока ({tx})
                </span>
                {busy && !liveUdsRunning ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopScanRef.current = true;
                    }}
                    className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-200"
                  >
                    Стоп
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Открывает сессию `10 03`, удерживает её через `3E 00`, находит рабочие DID на блоке (например CVT `7E1` или ABS `7B0`) и в конце отправляет `10 01`, чтобы погасить лампы на панели.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0xf180, to: 0xf1ff, label: "F180–F1FF", stopOnSilence: true })}
                  className="rounded-lg border border-slate-600 px-2.5 py-2 text-xs font-medium disabled:opacity-40"
                >
                  Паспорт (F180–F1FF)
                </button>
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0x1000, to: 0x107f, label: "1000–107F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 disabled:opacity-40"
                >
                  Датчики 1000–107F
                </button>
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0x1100, to: 0x117f, label: "1100–117F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 disabled:opacity-40"
                >
                  Датчики 1100–117F
                </button>
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0x2000, to: 0x207f, label: "2000–207F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 disabled:opacity-40"
                >
                  Датчики 2000–207F
                </button>
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0x2100, to: 0x217f, label: "2100–217F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 disabled:opacity-40"
                >
                  Датчики 2100–217F
                </button>
                <button
                  type="button"
                  disabled={busy || monitoring}
                  onClick={() => void scanDids({ from: 0xd000, to: 0xd07f, label: "D000–D07F", stopOnSilence: false })}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 disabled:opacity-40"
                >
                  Датчики D000–D07F
                </button>
              </div>
              {didProgress ? (
                <p className="mt-1.5 text-xs text-slate-400">
                  Проверено DID: {didProgress} · найдено ответов: {didHits.length}
                </p>
              ) : null}
              {didHits.length > 0 ? (
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs">
                  {didHits.map((row) => {
                    const inWatch = watchedDids.includes(row.did);
                    return (
                      <li
                        key={row.did}
                        className="flex items-start justify-between gap-2 rounded-md bg-slate-900 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-emerald-400">22 {row.did}</span>
                          <div className="break-all font-mono text-slate-200">{row.text}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleWatchedDid(row.did)}
                          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${
                            inWatch
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-600 text-slate-300"
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

            <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-200">
                  Live-монитор UDS (поток данных блока {tx} как в Launch)
                </span>
                <button
                  type="button"
                  disabled={busy && !liveUdsRunning}
                  onClick={() => void sendRequest("10 01")}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-200 disabled:opacity-40"
                >
                  Погасить лампы (10 01)
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
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
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
                >
                  + Добавить текущую команду ({request})
                </button>
              </div>
              <div className="mt-2.5 flex gap-2">
                {!liveUdsRunning ? (
                  <button
                    type="button"
                    disabled={busy || monitoring || watchedDids.length === 0}
                    onClick={() => void startLiveUds()}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
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
                          ? "border-amber-400/60 bg-amber-950/30"
                          : "border-slate-800 bg-slate-950/90"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-emerald-300">22 {row.did}</span>
                        <div className="flex items-center gap-1.5">
                          {row.changed ? (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                              ИЗМЕНИЛСЯ
                            </span>
                          ) : null}
                          <span className="font-mono text-[11px] text-slate-500">#{row.count}</span>
                        </div>
                      </div>
                      <div className="mt-0.5 break-all font-mono text-slate-100">{row.text}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
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
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm disabled:opacity-40"
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
    <label className="block text-xs text-slate-400">
      {label}
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 disabled:opacity-40"
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
        active ? "bg-emerald-600 text-white" : "text-slate-400"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
