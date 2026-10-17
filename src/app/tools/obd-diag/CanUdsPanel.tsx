"use client";

import { useEffect, useRef, useState } from "react";
import type { ModuleScanItem, ObdBleSession } from "@/lib/obd/obd-session";
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
}: {
  session: ObdBleSession;
  enabled: boolean;
  linkLostTick: number;
  onLog: (line: string) => void;
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
  const [catalog, setCatalog] = useState<DecodedSignal[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const stopScanRef = useRef(false);
  const recordsRef = useRef<CsvRow[]>([]);
  const recordingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const rowsRef = useRef<FrameRow[]>([]);

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
        setRows(faded);
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
      setRows(next);
      if (lossAdd) setLosses((count) => count + lossAdd);
      if (tapeAdd.length) {
        setTape((prev) => [...prev, ...tapeAdd].slice(-TAPE_LIMIT));
      }
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
          ? formatUdsPayload(result.parsed.payload)
          : result.parsed.kind === "negative"
            ? `7F ${result.parsed.nrcText ?? ""}`.trim()
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

  const runCatalog = async (group: "subaru" | "pajero") => {
    setBusy(true);
    setLocalError(null);
    setCatalog([]);
    const rows: DecodedSignal[] = [];
    setProtocol("6");
    try {
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
      onLog(group === "subaru" ? "Subaru SSM" : "Pajero 21");
    } finally {
      setBusy(false);
    }
  };

  const scan = async (kind: "10 01" | "3E 00", preset: "standard" | "extended" = "standard") => {
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
      onLog(`Сканер блоков ${kind} (${preset === "extended" ? "Subaru/Mitsubishi" : "7E0–7DF"})`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Сканер остановлен");
    } finally {
      setBusy(false);
    }
  };

  const scanDids = async () => {
    setBusy(true);
    stopScanRef.current = false;
    setDidHits([]);
    setDidProgress("0 / 128");
    setLocalError(null);
    try {
      await session.scanIdentificationDids(
        protocol,
        tx,
        rx,
        (done, total, hit) => {
          setDidProgress(`${done} / ${total}`);
          if (hit) setDidHits((prev) => [...prev, hit]);
        },
        () => stopScanRef.current,
      );
      onLog(`Сканер DID F180–F1FF (${tx})`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Сканер DID остановлен");
    } finally {
      setBusy(false);
    }
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
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
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
                    <td className="px-2 py-2 font-mono">
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
          <pre className="max-h-40 overflow-auto rounded-md bg-black/40 p-2 text-xs text-slate-400">
            {tape.join("\n")}
          </pre>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-300">Заводские таблицы (1 нажатие)</div>
            <p className="mt-1 text-xs text-slate-500">
              Subaru — протокол SSM (`A8`, адрес `7E0`). Pajero Sport — таблицы `21 01–04` (`7E0`).
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runCatalog("subaru")}
                className="flex-1 rounded-xl bg-emerald-600/90 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Subaru SSM
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void runCatalog("pajero")}
                className="flex-1 rounded-xl border border-slate-600 px-3 py-2.5 text-sm disabled:opacity-40"
              >
                Pajero 21
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
              Определяет реальный CAN-адрес ответившего блока (даже на `7DF`). Нажмите на найденный блок, чтобы подставить его `TX / RX`.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("3E 00", "standard")}
                className="rounded-xl border border-slate-600 px-3 py-2.5 text-xs font-medium disabled:opacity-40"
              >
                Сканер 3E 00 (7E0–7DF)
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("10 01", "standard")}
                className="rounded-xl border border-slate-600 px-3 py-2.5 text-xs font-medium disabled:opacity-40"
              >
                Сканер 10 01 (сессия)
              </button>
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scan("3E 00", "extended")}
                className="col-span-2 rounded-xl border border-emerald-600/60 bg-emerald-950/30 px-3 py-2.5 text-xs font-medium text-emerald-200 disabled:opacity-40"
              >
                Расширенный поиск (Двигатель, КПП, ABS, ETACS, SRS)
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

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy || monitoring}
                onClick={() => void scanDids()}
                className="flex-1 rounded-xl border border-slate-600 px-3 py-2.5 text-xs font-medium disabled:opacity-40"
              >
                Сканер паспорта блока (DID F180–F1FF)
              </button>
            </div>
            {didProgress ? (
              <p className="mt-1 text-xs text-slate-500">
                Проверено DID: {didProgress} · найдено ответов: {didHits.length}
              </p>
            ) : null}
            {didHits.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {didHits.map((row) => (
                  <li key={row.did} className="rounded-md bg-slate-950 px-3 py-2">
                    <span className="font-mono text-emerald-400">22 {row.did}</span>
                    <div className="break-all font-mono text-slate-200">{row.text}</div>
                  </li>
                ))}
              </ul>
            ) : null}

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
