"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatBleFailure } from "@/lib/obd/ble-error";
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
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import { useObdScroll } from "./ObdScrollContext";
import CanUdsPanel from "./CanUdsPanel";
import {
  BrandDiagPanel,
  type MitsubishiDiagView,
} from "./BrandDiagPanel";
import { LiveMetricCards } from "./LiveMetricCards";

type ToolTab = "obd" | "brand-diag" | "mitsubishi" | "can";
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

export default function ObdDiagClient({
  mode = "subaru",
}: {
  mode?: "subaru" | "mitsubishi";
} = {}) {
  const isMitsuMode = mode === "mitsubishi";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session] = useState(() => new ObdBleSession());
  const sessionRef = useRef(session);
  const [tab, setTab] = useState<ToolTab>(() => {
    const param = searchParams.get("tab");
    if (param === "can") return "can";
    if (param === "obd" || param === "live") return "obd";
    return "brand-diag";
  });
  const [mitsuDiagView, setMitsuDiagView] = useState<MitsubishiDiagView>(() => {
    const param = searchParams.get("tab");
    if (param === "mitsu-sas" || param === "steering-mitsu") return "steering";
    if (param === "tpms" || param === "mitsu-tpms" || searchParams.get("view") === "tpms") return "tpms";
    if (searchParams.get("view") === "steering") return "steering";
    if (searchParams.get("view") === "service") return "service";
    return "ecu";
  });
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
  const [poll, setPoll] = useState(false);
  const [linkLostTick, setLinkLostTick] = useState(0);
  const [envLines, setEnvLines] = useState<string[] | null>(null);

  const minMaxRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  const pinnedRef = useRef<ReadonlySet<string>>(new Set());

  const { transport, ready: transportReady } = useObdTransportKind();

  useEffect(() => {
    if (!isMitsuMode) return;
    const param = searchParams.get("tab");
    if (param === "mitsubishi" || param === "etacs") {
      router.replace("/tools/etacs-coding");
    }
  }, [isMitsuMode, router, searchParams]);

  useEffect(() => {
    pinnedRef.current = onlyPinned && pinnedPids.length > 0 ? new Set(pinnedPids) : new Set();
  }, [onlyPinned, pinnedPids]);

  const obdScroll = useObdScroll();
  const pendingLive = useRef<{ pids: LiveTile[]; note: string | null } | null>(null);

  useEffect(() => {
    if (!obdScroll) return;
    return obdScroll.registerScrollFlush(() => {
      const pending = pendingLive.current;
      pendingLive.current = null;
      if (!pending) return;
      setPids(pending.pids);
      setPidNote(pending.note);
    });
  }, [obdScroll]);

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
          if (obdScroll?.scrollingRef.current) {
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
  }, [obdScroll, poll, phase, tab]);

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
          isMitsuMode
            ? `${msg} Адаптер уже подключён — вкладки MMC, OBD2 Live и CAN / UDS доступны, либо включите зажигание и нажмите «Повторить связь с ЭБУ».`
            : `${msg} Адаптер уже подключён — вкладки SSM4 и CAN / UDS доступны, либо включите зажигание и нажмите «Повторить связь с ЭБУ».`,
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
    <>
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">
              {isMitsuMode ? "QHub · MMC" : "QHub · SSM4 & OBD-II"}
            </p>
            <h1 className="text-xl font-semibold">
              {isMitsuMode ? "Mitsubishi Diagnostics" : "Subaru Diagnostics"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {supplyVolts != null ? (
              <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-mono text-xs text-emerald-700">
                {supplyVolts.toFixed(1)} В
              </span>
            ) : null}
          </div>
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

        <div className="mb-3 space-y-2">
          {!transportReady ? (
            <p className="min-h-[2.5rem] text-xs leading-relaxed text-gray-500">Проверка Bluetooth…</p>
          ) : null}

          {transportReady && transport === "none" ? (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{obdTransportHint("none")}</p>
              <button
                type="button"
                className="text-xs underline text-amber-900/90"
                onClick={() => setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()))}
              >
                Показать диагностику Bluetooth
              </button>
              {envLines ? (
                <pre className="whitespace-pre-wrap text-xs text-amber-900/90">{envLines.join("\n")}</pre>
              ) : null}
            </div>
          ) : null}

          {transportReady && transport !== "none" && phase === "idle" && obdTransportHint(transport) ? (
            <p className="text-xs text-gray-500">{obdTransportHint(transport)}</p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="mb-3 flex min-w-0 flex-wrap rounded-xl border border-gray-200 bg-gray-50 p-1">
          <TabButton
            active={tab === "brand-diag"}
            onClick={() => {
              setPoll(false);
              setTab("brand-diag");
            }}
          >
            {isMitsuMode ? "MMC Блоки" : "Subaru SSM4"}
          </TabButton>
          {isMitsuMode ? (
            <Link
              href="/tools/etacs-coding"
              className="flex-1 rounded-lg px-1 py-2 text-center text-xs font-medium text-gray-500 transition hover:text-gray-800 sm:text-sm"
            >
              Mitsubishi ETACS
            </Link>
          ) : null}
          <TabButton active={tab === "obd"} onClick={() => setTab("obd")}>
            OBD2 Live
          </TabButton>
          <TabButton
            active={tab === "can"}
            onClick={() => {
              setPoll(false);
              setTab("can");
            }}
          >
            CAN / UDS
          </TabButton>
        </div>

        {(tab === "brand-diag" || (!isMitsuMode && tab === "mitsubishi")) ? (
          <BrandDiagPanel
            brand={isMitsuMode ? "mitsubishi" : "subaru"}
            onBrandChange={() => {}}
            mitsuView={mitsuDiagView}
            onMitsuViewChange={setMitsuDiagView}
            session={session}
            phase={phase}
            ready={phase !== "idle"}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            vinHint={identity?.vin}
          />
        ) : tab === "obd" ? (
          <section className="flex flex-col gap-3">
            <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
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
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>
                      Нажмите на карточку, чтобы отметить ★ ({pinnedPids.length})
                    </span>
                    {pinnedPids.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOnlyPinned((v) => !v)}
                        className={`rounded-lg border px-2.5 py-1 font-medium ${
                          onlyPinned
                            ? "border-emerald-500 bg-emerald-100 text-emerald-800"
                            : "border-gray-300 text-gray-700"
                        }`}
                      >
                        {onlyPinned ? "Показать все" : "Опрашивать только ★ (быстро)"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Стандарт SAE J1979. Выберите нужные датчики звездой ★ для быстрого опроса 3–4 раза в секунду.
                  </p>
                )}

                {pidNote ? (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
        ) : (
          <CanUdsPanel
            session={session}
            enabled={phase !== "idle"}
            linkLostTick={linkLostTick}
            onLog={pushLog}
            brand={isMitsuMode ? "mitsubishi" : "subaru"}
          />
        )}

        {log.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-xs font-medium text-gray-500">Журнал обмена</h2>
            <pre className="mt-1.5 max-h-48 overflow-x-clip break-all rounded-md bg-gray-100 p-2 text-xs text-gray-500">
              {log.join("\n")}
            </pre>
          </section>
        ) : null}
    </>
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
      <section className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span>{adapterLabel ?? "vLinker"} · ЭБУ на связи</span>
          </div>
          {elmVersion ? <div className="truncate text-[11px] text-gray-500">{elmVersion}</div> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 disabled:opacity-40"
        >
          Отключить
        </button>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-xl border border-gray-200 bg-white p-3.5 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-gray-500">
          Транспорт: <span className="text-gray-800">{transport}</span>
        </span>
        <span className="font-medium text-emerald-600">{phaseLabels[phase]}</span>
      </div>
      {adapterLabel ? (
        <div className="mt-1 text-xs text-gray-500">
          Адаптер: <span className="text-gray-800">{adapterLabel}</span>
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
              className="flex-1 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Повторить связь с ЭБУ (0100)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDisconnect}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-xs text-gray-700 disabled:opacity-40"
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
        active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function DtcList({ title, dtcs }: { title: string; dtcs: ObdDtc[] }) {
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="text-xs font-medium text-gray-500">{title}</h2>
      {dtcs.length === 0 ? (
        <p className="mt-1.5 text-sm font-medium text-emerald-600">Кодов ошибок не обнаружено</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {dtcs.map((d) => (
            <li key={d.code} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="font-mono font-semibold text-amber-800">{d.code}</div>
              <div className="mt-0.5 text-xs text-gray-700">{d.description}</div>
              <div className="mt-1 text-[11px] leading-snug text-gray-500">{remedyForDtcCode(d.code)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadinessList({ report }: { report: ReadinessReport }) {
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
      <div className="font-medium">
        {report.mil ? "Лампа Check Engine включена" : "Лампа Check Engine выключена"} · кодов: {report.dtcCount}
      </div>
      <p className="mt-1 text-xs text-gray-500">Тип двигателя: {report.ignition}</p>
      <p className="mt-2 text-xs text-gray-500">
        «Готово» — блок закончил самопроверку этой системы. «Не готово» — проверка ещё не завершена, обычно нужна поездка. Это не показания датчиков.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {report.lines.map((line) => (
          <li key={line} className="flex justify-between rounded bg-gray-50 px-2.5 py-1.5">
            <span>{line.split(":")[0]}</span>
            <span className={line.includes("не готово") ? "text-amber-800" : "text-emerald-600"}>
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
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="text-xs font-medium text-gray-500">Стоп-кадр (Mode 02)</h2>
      <p className="mt-1 text-sm font-medium">
        {report.dtc ? `Записан при ошибке ${report.dtc}` : "Сохраненного стоп-кадра ошибки нет"}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {report.readings.map((row) => (
          <li key={row.label} className="rounded-md bg-gray-50 px-3 py-2">
            <div className="text-xs text-gray-500">{row.label}</div>
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
        <li key={label} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
          <span className="text-xs text-gray-500">{label}</span>
          <div className="mt-0.5 break-all font-mono text-gray-900">{value ?? "—"}</div>
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
    <LiveMetricCards
      selectable
      items={pids.map((p) => ({
        id: p.pid,
        label: p.label,
        value: p.value,
        unit: p.unit,
        minText: p.minText,
        maxText: p.maxText,
        selected: pinned.includes(p.pid),
        highlight: pinned.includes(p.pid),
        onToggleSelect: () => onTogglePin(p.pid),
      }))}
    />
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
      ? "border border-gray-900 bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-400 disabled:border-gray-400"
      : "border border-gray-300 text-gray-800 hover:bg-gray-100 disabled:opacity-40";
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
