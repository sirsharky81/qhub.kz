"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatBleFailure } from "@/lib/obd/ble-error";
import { bytesToHex } from "@/lib/obd/hex";
import {
  ObdBleSession,
  type FreezeFrameReport,
  type ObdConnectionPhase,
  type VehicleIdentity,
} from "@/lib/obd/obd-session";
import {
  explainEmptyPidReadings,
  formatPidValue,
  type ObdDtc,
  type ReadinessReport,
} from "@/lib/obd/obd2";
import { formatObdEnvironmentLines, probeObdEnvironment } from "@/lib/obd/obd-environment";
import { obdTransportHint, useObdTransportKind } from "@/lib/obd/use-obd-transport";
import {
  downloadMitsubishiEtacsCoding,
  listMitsubishiEtacsProfiles,
} from "@/lib/obd/mitsubishi-etacs-download";
import { etacsDownloadNames, type EtacsCodingDump } from "@/lib/obd/mitsubishi-etacs";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import { useIosSingleScrollPane } from "@/hooks/useIosSingleScrollPane";
import CanUdsPanel from "./CanUdsPanel";

type ToolTab = "obd" | "mitsubishi" | "can";
type ObdSubTab = "live" | "dtc" | "info";

interface LiveTile {
  pid: string;
  label: string;
  value: string;
  unit: string;
  minText: string | null;
  maxText: string | null;
}

const phaseLabels: Record<ObdConnectionPhase, string> = {
  idle: "Не подключено",
  adapter: "Адаптер подключён",
  vehicle: "Связь с ЭБУ",
};

export default function ObdDiagClient() {
  const sessionRef = useRef(new ObdBleSession());
  const [tab, setTab] = useState<ToolTab>("obd");
  const [obdSubTab, setObdSubTab] = useState<ObdSubTab>("live");
  const [phase, setPhase] = useState<ObdConnectionPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [elmVersion, setElmVersion] = useState<string | null>(null);
  const [supplyVolts, setSupplyVolts] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dtcs, setDtcs] = useState<ObdDtc[]>([]);
  const [dtcChecked, setDtcChecked] = useState(false);
  const [dtcKind, setDtcKind] = useState("Сохранённые (Mode 03)");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [freeze, setFreeze] = useState<FreezeFrameReport | null>(null);
  const [identity, setIdentity] = useState<VehicleIdentity | null>(null);
  const [pids, setPids] = useState<LiveTile[]>([]);
  const [pinnedPids, setPinnedPids] = useState<string[]>([]);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [pidNote, setPidNote] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(listMitsubishiEtacsProfiles()[0]?.id ?? "auto");
  const [etacsDump, setEtacsDump] = useState<EtacsCodingDump | null>(null);
  const [poll, setPoll] = useState(false);
  const [linkLostTick, setLinkLostTick] = useState(0);
  const [envLines, setEnvLines] = useState<string[] | null>(null);

  const minMaxRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  const pinnedRef = useRef<ReadonlySet<string>>(new Set());

  const { transport, ready: transportReady } = useObdTransportKind();
  const profiles = listMitsubishiEtacsProfiles();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tab") === "mitsubishi") setTab("mitsubishi");
  }, [searchParams]);

  useEffect(() => {
    pinnedRef.current = onlyPinned && pinnedPids.length > 0 ? new Set(pinnedPids) : new Set();
  }, [onlyPinned, pinnedPids]);

  const { scrollRef, scrollingRef, onScrollEndRef } = useIosSingleScrollPane();
  const pendingLive = useRef<{ pids: LiveTile[]; note: string | null } | null>(null);
  const canUdsFlushRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const flushLive = () => {
      const pending = pendingLive.current;
      pendingLive.current = null;
      if (pending) {
        setPids(pending.pids);
        setPidNote(pending.note);
      }
      canUdsFlushRef.current?.();
    };
    onScrollEndRef.current = flushLive;
    return () => {
      if (onScrollEndRef.current === flushLive) onScrollEndRef.current = null;
    };
  }, [onScrollEndRef]);

  useEffect(() => {
    const session = sessionRef.current;
    session.setLinkLostHandler(() => {
      setPoll(false);
      setPhase("idle");
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setError("Связь с адаптером прервалась. Нажмите «Подключить vLinker» снова.");
      setLinkLostTick((tick) => tick + 1);
    });
    return () => session.setLinkLostHandler(null);
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), line]);
  }, []);

  useEffect(() => {
    if (!poll || phase !== "vehicle" || tab !== "obd") return;
    let cancelled = false;
    const tick = async () => {
      while (!cancelled) {
        try {
          const activeFilter = pinnedRef.current.size > 0 ? pinnedRef.current : undefined;
          const readings = await sessionRef.current.readLivePids(activeFilter);
          if (cancelled) return;
          const tiles: LiveTile[] = readings.map((r) => {
            if (r.value != null && Number.isFinite(r.value)) {
              const prev = minMaxRef.current.get(r.def.pid);
              minMaxRef.current.set(r.def.pid, {
                min: prev ? Math.min(prev.min, r.value) : r.value,
                max: prev ? Math.max(prev.max, r.value) : r.value,
              });
            }
            const stats = minMaxRef.current.get(r.def.pid);
            return {
              pid: r.def.pid,
              label: r.def.label,
              unit: r.def.unit,
              value: formatPidValue(r.value, r.def.digits),
              minText: stats ? formatPidValue(stats.min, r.def.digits) : null,
              maxText: stats ? formatPidValue(stats.max, r.def.digits) : null,
            };
          });
          const next = {
            pids: tiles,
            note: readings.some((r) => r.value != null)
              ? null
              : explainEmptyPidReadings(readings.map((r) => r.raw)),
          };
          if (scrollingRef.current) {
            pendingLive.current = next;
          } else {
            setPids(next.pids);
            setPidNote(next.note);
          }
        } catch (e) {
          if (!cancelled) setError(formatBleFailure(e));
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [poll, phase, tab]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      pushLog(`→ ${label}`);
      try {
        await fn();
        pushLog(`✓ ${label}`);
      } catch (e) {
        const msg = formatBleFailure(e);
        setError(msg);
        pushLog(`✗ ${label}: ${msg}`);
      } finally {
        setBusy(false);
        setPhase(sessionRef.current.phase);
      }
    },
    [pushLog],
  );

  const connectOneStep = () =>
    run("Подключение vLinker и связь с ЭБУ", async () => {
      setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()));
      const { name, elm } = await sessionRef.current.connectAdapter();
      setAdapterLabel(name);
      setElmVersion(elm.versionLine);
      setPhase(sessionRef.current.phase);
      try {
        const volts = await sessionRef.current.readSupplyVoltage();
        setSupplyVolts(volts);
      } catch {
        /* ignore */
      }
      try {
        const state = await sessionRef.current.linkVehicle();
        setPhase(sessionRef.current.phase);
        const probe = state.probe.replace(/\s+/g, " ").trim().slice(0, 180);
        pushLog(`0100: ${probe}`);
      } catch (vehicleErr) {
        const msg = formatBleFailure(vehicleErr);
        pushLog(`Адаптер подключён (CAN/UDS доступны). OBD-II: ${msg}`);
        setError(
          `${msg} Адаптер уже подключён — вкладки CAN / UDS и Mitsubishi доступны, либо включите зажигание и нажмите «Повторить связь с ЭБУ».`,
        );
      }
    });

  const connectVehicle = () =>
    run("Связь с автомобилем (OBD-II)", async () => {
      const state = await sessionRef.current.linkVehicle();
      setPhase(sessionRef.current.phase);
      const probe = state.probe.replace(/\s+/g, " ").trim().slice(0, 180);
      pushLog(`0100: ${probe}`);
    });

  const readDtcs = () =>
    run("Чтение кодов OBD", async () => {
      const list = await sessionRef.current.readObdDtcs();
      setDtcKind("Сохранённые (Mode 03)");
      setDtcs(list);
      setDtcChecked(true);
    });

  const readPending = () =>
    run("Ожидающие коды", async () => {
      const list = await sessionRef.current.readPendingDtcs();
      setDtcKind("Ожидающие (Mode 07)");
      setDtcs(list);
      setDtcChecked(true);
    });

  const readPermanent = () =>
    run("Постоянные коды", async () => {
      const list = await sessionRef.current.readPermanentDtcs();
      setDtcKind("Постоянные (Mode 0A)");
      setDtcs(list);
      setDtcChecked(true);
    });

  const readReady = () =>
    run("Готовность мониторов", async () => {
      setReadiness(await sessionRef.current.readReadiness());
    });

  const readFreeze = () =>
    run("Снимок ошибки", async () => {
      setFreeze(await sessionRef.current.readFreezeFrame());
    });

  const readIdentity = () =>
    run("VIN и калибровка", async () => {
      setIdentity(await sessionRef.current.readVehicleIdentity());
    });

  const clearDtcs = () =>
    run("Сброс кодов OBD", async () => {
      const confirmed = window.confirm("Сбросить коды ошибок двигателя (Mode 04) и мониторы готовности?");
      if (!confirmed) return;
      await sessionRef.current.clearObdDtcs();
      setDtcs([]);
      setDtcChecked(true);
    });

  const readEtacs = () =>
    run("Чтение кодировки ETACS (.kon / .cuf)", async () => {
      const dump = await downloadMitsubishiEtacsCoding(sessionRef.current, profileId);
      setEtacsDump(dump);
      pushLog(
        `ETACS ${dump.txHex}→${dump.rxHex}: variant ${dump.variant.length} байт, custom ${dump.custom.length} байт${
          dump.partNumber ? `, блок ${dump.partNumber}` : ""
        }`,
      );
    });

  const saveEtacsFile = async (kind: "kon" | "cuf" | "json") => {
    if (!etacsDump) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const prefix = etacsDump.partNumber ? `etacs_${etacsDump.partNumber}_${stamp}` : `etacs_${stamp}`;
    const names = etacsDownloadNames(prefix);
    if (kind === "kon") {
      await saveBlobToDevice(
        new Blob([Uint8Array.from(etacsDump.variant)], { type: "application/octet-stream" }),
        names.kon,
      );
      pushLog(`Сохранён ${names.kon} (${etacsDump.variant.length} байт)`);
      return;
    }
    if (kind === "cuf") {
      await saveBlobToDevice(
        new Blob([Uint8Array.from(etacsDump.custom)], { type: "application/octet-stream" }),
        names.cuf,
      );
      pushLog(`Сохранён ${names.cuf} (${etacsDump.custom.length} байт)`);
      return;
    }
    const backup = {
      timestamp: new Date().toISOString(),
      profileId: etacsDump.profileId,
      tx: etacsDump.txHex,
      rx: etacsDump.rxHex,
      partNumber: etacsDump.partNumber,
      swVersion: etacsDump.swVersion ?? null,
      vin: etacsDump.vin ?? null,
      variantUsedId: etacsDump.variantUsedId ?? null,
      customUsedId: etacsDump.customUsedId ?? null,
      variantHex: bytesToHex(etacsDump.variant, ""),
      customHex: bytesToHex(etacsDump.custom, ""),
      extraLids: (etacsDump.extraLids ?? []).map((item) => ({
        lidHex: item.lidHex,
        label: item.label,
        length: item.payload.length,
        hex: bytesToHex(item.payload, " "),
        ascii: item.ascii,
      })),
    };
    await saveBlobToDevice(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      names.json,
    );
    pushLog(`Сохранён резервный ${names.json}`);
  };

  const togglePin = (pid: string) => {
    setPinnedPids((prev) =>
      prev.includes(pid) ? prev.filter((item) => item !== pid) : [...prev, pid],
    );
  };

  const disconnect = () =>
    run("Отключение", async () => {
      await sessionRef.current.disconnect();
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setDtcs([]);
      setDtcChecked(false);
      setReadiness(null);
      setFreeze(null);
      setIdentity(null);
      setPids([]);
      setPidNote(null);
      setPoll(false);
      setPhase("idle");
      minMaxRef.current.clear();
    });

  return (
    <div
      ref={scrollRef}
      className="bg-slate-950 text-slate-100"
      style={{
        position: "fixed",
        inset: 0,
        overflowX: "clip",
        overflowY: "auto",
        overscrollBehavior: "none",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
      }}
    >
      <div className="mx-auto max-w-lg px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-emerald-400/90">QHub · Диагностика</p>
            <h1 className="text-xl font-semibold">OBD / CAN / ETACS Scanner</h1>
          </div>
          {supplyVolts != null ? (
            <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-emerald-300">
              {supplyVolts.toFixed(1)} В
            </span>
          ) : null}
        </header>

        <ConnectionPanel
          transport={transportReady ? transport : "…"}
          phase={phase}
          adapterLabel={adapterLabel}
          elmVersion={elmVersion}
          busy={busy}
          transportReady={transportReady}
          onConnectOneStep={connectOneStep}
          onConnectVehicle={connectVehicle}
          onDisconnect={disconnect}
        />

        {!transportReady ? (
          <p className="mb-3 text-xs text-slate-500">Проверка Bluetooth…</p>
        ) : null}

        {transportReady && transport === "none" ? (
          <div className="mb-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <p>{obdTransportHint("none")}</p>
            <button
              type="button"
              className="text-xs underline text-amber-200/90"
              onClick={() => setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()))}
            >
              Показать диагностику Bluetooth
            </button>
            {envLines ? (
              <pre className="whitespace-pre-wrap text-xs text-amber-100/90">{envLines.join("\n")}</pre>
            ) : null}
          </div>
        ) : null}

        {transportReady && transport !== "none" && phase === "idle" && obdTransportHint(transport) ? (
          <p className="mb-3 text-xs text-slate-500">{obdTransportHint(transport)}</p>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
        ) : null}

        <div className="mb-3 flex rounded-xl border border-slate-800 bg-slate-900/50 p-1">
          <TabButton active={tab === "obd"} onClick={() => setTab("obd")}>
            OBD-II
          </TabButton>
          <TabButton
            active={tab === "can"}
            disabled={phase === "idle"}
            onClick={() => {
              setPoll(false);
              setTab("can");
            }}
          >
            CAN / UDS
          </TabButton>
          <TabButton
            active={tab === "mitsubishi"}
            onClick={() => {
              setPoll(false);
              setTab("mitsubishi");
            }}
          >
            Mitsubishi ETACS
          </TabButton>
        </div>

        {tab === "obd" ? (
          <section className="flex flex-col gap-3">
            <div className="flex rounded-xl border border-slate-800 bg-slate-900/40 p-1">
              <TabButton active={obdSubTab === "live"} onClick={() => setObdSubTab("live")}>
                Параметры (Live)
              </TabButton>
              <TabButton
                active={obdSubTab === "dtc"}
                onClick={() => {
                  setPoll(false);
                  setObdSubTab("dtc");
                }}
              >
                Ошибки и мониторы
              </TabButton>
              <TabButton
                active={obdSubTab === "info"}
                onClick={() => {
                  setPoll(false);
                  setObdSubTab("info");
                }}
              >
                VIN / Паспорт
              </TabButton>
            </div>

            {obdSubTab === "live" ? (
              <div className="flex flex-col gap-2.5">
                <ActionButton disabled={busy || phase !== "vehicle"} onClick={() => setPoll((p) => !p)}>
                  {poll ? "Остановить live-параметры" : "Запустить live-параметры"}
                </ActionButton>

                {pids.length > 0 ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span>
                      Нажмите на карточку, чтобы отметить ★ ({pinnedPids.length})
                    </span>
                    {pinnedPids.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOnlyPinned((v) => !v)}
                        className={`rounded-lg border px-2.5 py-1 font-medium ${
                          onlyPinned
                            ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                            : "border-slate-700 text-slate-300"
                        }`}
                      >
                        {onlyPinned ? "Показать все" : "Опрашивать только ★ (быстро)"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Стандарт SAE J1979 (Subaru, Mitsubishi, Toyota и др.). Выберите нужные датчики звездой ★ для быстрого опроса 3–4 раза в секунду.
                  </p>
                )}

                {pidNote ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {pidNote}
                  </p>
                ) : null}

                {pids.length > 0 ? (
                  <PidGrid pids={pids} pinned={pinnedPids} onTogglePin={togglePin} />
                ) : null}
              </div>
            ) : obdSubTab === "dtc" ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton disabled={busy || phase !== "vehicle"} onClick={readDtcs}>
                    Сохранённые (03)
                  </ActionButton>
                  <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={readPending}>
                    Ожидающие (07)
                  </ActionButton>
                  <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={readPermanent}>
                    Постоянные (0A)
                  </ActionButton>
                  <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={clearDtcs}>
                    Сбросить (Mode 04)
                  </ActionButton>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={readReady}>
                    Готовность мониторов
                  </ActionButton>
                  <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={readFreeze}>
                    Стоп-кадр (Mode 02)
                  </ActionButton>
                </div>

                {dtcChecked ? <DtcList title={dtcKind} dtcs={dtcs} /> : null}
                {readiness ? <ReadinessList report={readiness} /> : null}
                {freeze ? <FreezeList report={freeze} /> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ActionButton disabled={busy || phase !== "vehicle"} onClick={readIdentity}>
                  Считать VIN, калибровку и CVN
                </ActionButton>
                {identity ? <IdentityList report={identity} /> : null}
              </div>
            )}
          </section>
        ) : tab === "mitsubishi" ? (
          <section className="flex flex-col gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-medium text-slate-200">
                Выгрузка кодировки Mitsubishi ETACS (`.kon` и `.cuf`)
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Совместимо с MMCodingWriter и MUT Coding. Читает Variant Coding (`LID 30`) и Custom Coding (`LID 31`) без удаления номеров строк и без обрезки длинных ISO-TP кадров. Зажигание должно быть в положении ON.
              </p>

              <label className="mt-3 block text-xs text-slate-400">
                Профиль адресации CAN ETACS
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  disabled={busy || phase === "idle"}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3">
                <ActionButton disabled={busy || phase === "idle"} onClick={readEtacs}>
                  Считать кодировку из блока ETACS
                </ActionButton>
              </div>
            </div>

            {etacsDump ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-emerald-200">Кодировка успешно считана</span>
                  <span className="font-mono text-xs text-slate-400">
                    {etacsDump.txHex} → {etacsDump.rxHex}
                  </span>
                </div>
                {etacsDump.partNumber ? (
                  <p className="mt-1 text-xs text-slate-300">
                    Номер блока / SW: <span className="font-mono text-emerald-300">{etacsDump.partNumber}</span>
                    {etacsDump.swVersion ? (
                      <span className="ml-2 font-mono text-slate-400">({etacsDump.swVersion})</span>
                    ) : null}
                  </p>
                ) : null}
                {etacsDump.vin ? (
                  <p className="mt-0.5 text-xs text-slate-300">
                    VIN в ETACS: <span className="font-mono text-cyan-300">{etacsDump.vin}</span>
                  </p>
                ) : null}
                {etacsDump.customStatusNote ? (
                  <p className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                    {etacsDump.customStatusNote}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-950/80 p-2">
                    <div className="text-slate-400">
                      Variant (`.kon`){etacsDump.variantUsedId ? ` · ${etacsDump.variantUsedId}` : ""}
                    </div>
                    <div className="font-mono text-sm font-medium text-slate-100">
                      {etacsDump.variant.length} байт
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                      {bytesToHex(etacsDump.variant.slice(0, 12))}…
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 p-2">
                    <div className="text-slate-400">
                      Custom (`.cuf`){etacsDump.customUsedId ? ` · ${etacsDump.customUsedId}` : ""}
                    </div>
                    <div className="font-mono text-sm font-medium text-slate-100">
                      {etacsDump.custom.length > 0 ? `${etacsDump.custom.length} байт` : "не отдан (7F 21 12)"}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                      {etacsDump.custom.length > 0
                        ? `${bytesToHex(etacsDump.custom.slice(0, 12))}…`
                        : etacsDump.rawCustomResponse.slice(0, 48)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEtacsFile("kon")}
                    className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white"
                  >
                    Скачать .kon ({etacsDump.variant.length} Б)
                  </button>
                  <button
                    type="button"
                    disabled={etacsDump.custom.length === 0}
                    onClick={() => void saveEtacsFile("cuf")}
                    className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {etacsDump.custom.length > 0
                      ? `Скачать .cuf (${etacsDump.custom.length} Б)`
                      : "Нет .cuf в блоке"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveEtacsFile("json")}
                    className="col-span-2 rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-200"
                  >
                    Сохранить резервную копию (.json с дампом)
                  </button>
                </div>

                {etacsDump.extraLids && etacsDump.extraLids.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs">
                    <div className="font-medium text-slate-300">
                      Дополнительные регистры блока ({etacsDump.extraLids.length} LID) — нажмите, чтобы использовать как `.cuf`:
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {etacsDump.extraLids.map((extra) => (
                        <div
                          key={extra.lidHex}
                          className="flex items-center justify-between gap-2 rounded bg-slate-900/80 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-200">
                              <span className="font-mono text-emerald-300">{extra.lidHex}</span> · {extra.label} (
                              {extra.payload.length} Б)
                            </div>
                            <div className="truncate font-mono text-[10px] text-slate-400">
                              {extra.ascii ? `${extra.ascii} · ` : ""}
                              {bytesToHex(extra.payload.slice(0, 16))}
                              {extra.payload.length > 16 ? "…" : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setEtacsDump((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      custom: extra.payload,
                                      customUsedId: extra.lidHex,
                                      customStatusNote: null,
                                    }
                                  : prev,
                              )
                            }
                            className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-200"
                          >
                            В .cuf
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : (
          <CanUdsPanel
            session={sessionRef.current}
            enabled={phase !== "idle"}
            linkLostTick={linkLostTick}
            onLog={pushLog}
            isScrollingRef={scrollingRef}
            scrollFlushRef={canUdsFlushRef}
          />
        )}

        {log.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-xs font-medium text-slate-400">Журнал обмена</h2>
            <pre className="mt-1.5 max-h-40 overflow-y-auto overflow-x-clip overscroll-y-contain rounded-md bg-black/40 p-2 text-xs text-slate-400">
              {log.join("\n")}
            </pre>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ConnectionPanel({
  transport,
  phase,
  adapterLabel,
  elmVersion,
  busy,
  transportReady,
  onConnectOneStep,
  onConnectVehicle,
  onDisconnect,
}: {
  transport: string;
  phase: ObdConnectionPhase;
  adapterLabel: string | null;
  elmVersion: string | null;
  busy: boolean;
  transportReady: boolean;
  onConnectOneStep: () => void;
  onConnectVehicle: () => void;
  onDisconnect: () => void;
}) {
  if (phase === "vehicle") {
    return (
      <section className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-3.5 py-2.5 text-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-emerald-300">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span>{adapterLabel ?? "vLinker"} · ЭБУ на связи</span>
          </div>
          {elmVersion ? <div className="truncate text-[11px] text-slate-400">{elmVersion}</div> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
        >
          Отключить
        </button>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">
          Транспорт: <span className="text-slate-200">{transport}</span>
        </span>
        <span className="font-medium text-emerald-400">{phaseLabels[phase]}</span>
      </div>
      {adapterLabel ? (
        <div className="mt-1 text-xs text-slate-400">
          Адаптер: <span className="text-slate-200">{adapterLabel}</span>
          {elmVersion ? ` (${elmVersion})` : ""}
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        <ActionButton disabled={busy || !transportReady} onClick={onConnectOneStep}>
          {phase === "idle" ? "Подключить vLinker и автомобиль" : "Переподключить vLinker"}
        </ActionButton>
        {phase === "adapter" ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onConnectVehicle}
              className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Повторить связь с ЭБУ (0100)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDisconnect}
              className="rounded-xl border border-slate-600 px-3 py-2.5 text-xs text-slate-300 disabled:opacity-40"
            >
              Отключить
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-lg px-1 py-2 text-xs font-medium transition sm:text-sm ${
        active ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function DtcList({ title, dtcs }: { title: string; dtcs: ObdDtc[] }) {
  return (
    <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <h2 className="text-xs font-medium text-slate-400">{title}</h2>
      {dtcs.length === 0 ? (
        <p className="mt-1.5 text-sm font-medium text-emerald-400">Кодов ошибок не обнаружено</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {dtcs.map((d) => (
            <li key={d.code} className="rounded-lg bg-slate-950 px-3 py-2">
              <div className="font-mono font-semibold text-amber-300">{d.code}</div>
              <div className="mt-0.5 text-xs text-slate-300">{d.description}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadinessList({ report }: { report: ReadinessReport }) {
  return (
    <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm">
      <div className="font-medium">
        {report.mil ? "Лампа Check Engine включена" : "Лампа Check Engine выключена"} · кодов: {report.dtcCount}
      </div>
      <p className="mt-1 text-xs text-slate-500">Тип двигателя: {report.ignition}</p>
      <p className="mt-2 text-xs text-slate-400">
        «Готово» — блок закончил самопроверку этой системы. «Не готово» — проверка ещё не завершена, обычно нужна поездка. Это не показания датчиков.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-300">
        {report.lines.map((line) => (
          <li key={line} className="flex justify-between rounded bg-slate-950/60 px-2.5 py-1.5">
            <span>{line.split(":")[0]}</span>
            <span className={line.includes("не готово") ? "text-amber-300" : "text-emerald-400"}>
              {line.split(":")[1]?.trim()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FreezeList({ report }: { report: FreezeFrameReport }) {
  return (
    <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <h2 className="text-xs font-medium text-slate-400">Стоп-кадр (Mode 02)</h2>
      <p className="mt-1 text-sm font-medium">
        {report.dtc ? `Записан при ошибке ${report.dtc}` : "Сохраненного стоп-кадра ошибки нет"}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {report.readings.map((row) => (
          <li key={row.label} className="rounded-md bg-slate-950 px-3 py-2">
            <div className="text-xs text-slate-500">{row.label}</div>
            <div className="font-medium tabular-nums">
              {row.value} {row.unit}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityList({ report }: { report: VehicleIdentity }) {
  const rows = [
    ["VIN", report.vin],
    ["Калибровка (CAL ID)", report.calid],
    ["Контрольная сумма (CVN)", report.cvn],
  ];
  return (
    <ul className="mt-2 space-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <li key={label} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <span className="text-xs text-slate-400">{label}</span>
          <div className="mt-0.5 break-all font-mono text-slate-100">{value ?? "—"}</div>
        </li>
      ))}
    </ul>
  );
}

function PidGrid({
  pids,
  pinned,
  onTogglePin,
}: {
  pids: LiveTile[];
  pinned: string[];
  onTogglePin: (pid: string) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm">
      {pids.map((p) => {
        const isPinned = pinned.includes(p.pid);
        return (
          <li
            key={p.pid}
            onClick={() => onTogglePin(p.pid)}
            className={`min-h-[4.5rem] cursor-pointer rounded-lg border px-3 py-2 transition ${
              isPinned
                ? "border-emerald-500/50 bg-emerald-950/20"
                : "border-slate-800/80 bg-slate-900"
            }`}
          >
            <div className="flex items-start justify-between gap-1 text-xs text-slate-400">
              <span className="truncate">{p.label}</span>
              <span className={isPinned ? "text-emerald-400" : "text-slate-600"}>★</span>
            </div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-100">
              {p.value} <span className="text-xs font-normal text-slate-400">{p.unit}</span>
            </div>
            {p.minText && p.maxText && p.minText !== p.maxText ? (
              <div className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
                мин {p.minText} · макс {p.maxText}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const base =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-700"
      : "border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-medium transition ${base} disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
