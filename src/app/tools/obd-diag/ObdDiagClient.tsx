"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatBleFailure } from "@/lib/obd/ble-error";
import { ObdBleSession, type ObdConnectionPhase } from "@/lib/obd/obd-session";
import { formatObdEnvironmentLines, probeObdEnvironment } from "@/lib/obd/obd-environment";
import { obdTransportHint, useObdTransportKind } from "@/lib/obd/use-obd-transport";
import {
  downloadMitsubishiEtacsCoding,
  listMitsubishiEtacsProfiles,
} from "@/lib/obd/mitsubishi-etacs-download";
import { etacsDownloadNames } from "@/lib/obd/mitsubishi-etacs";
import { explainEmptyPidReadings, formatPidValue } from "@/lib/obd/obd2";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import CanUdsPanel from "./CanUdsPanel";

type ToolTab = "obd" | "mitsubishi" | "can";

const phaseLabels: Record<ObdConnectionPhase, string> = {
  idle: "Не подключено",
  adapter: "Адаптер",
  vehicle: "Автомобиль",
};

export default function ObdDiagClient() {
  const sessionRef = useRef(new ObdBleSession());
  const [tab, setTab] = useState<ToolTab>("obd");
  const [phase, setPhase] = useState<ObdConnectionPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [elmVersion, setElmVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dtcs, setDtcs] = useState<{ code: string }[]>([]);
  const [pids, setPids] = useState<{ label: string; value: string; unit: string }[]>([]);
  const [pidNote, setPidNote] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(listMitsubishiEtacsProfiles()[0]?.id ?? "");
  const [poll, setPoll] = useState(false);
  const [linkLostTick, setLinkLostTick] = useState(0);
  const [envLines, setEnvLines] = useState<string[] | null>(null);

  const { transport, ready: transportReady } = useObdTransportKind();
  const profiles = listMitsubishiEtacsProfiles();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tab") === "mitsubishi") setTab("mitsubishi");
  }, [searchParams]);

  useEffect(() => {
    const session = sessionRef.current;
    session.setLinkLostHandler(() => {
      setPoll(false);
      setPhase("idle");
      setAdapterLabel(null);
      setElmVersion(null);
      setError("Связь с адаптером прервалась. Нажмите «1. Подключить vLinker» снова.");
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
          const readings = await sessionRef.current.readLivePids();
          if (cancelled) return;
          setPids(
            readings.map((r) => ({
              label: r.def.label,
              unit: r.def.unit,
              value: formatPidValue(r.value, r.def.digits),
            })),
          );
          const anyValue = readings.some((r) => r.value != null);
          setPidNote(anyValue ? null : explainEmptyPidReadings(readings.map((r) => r.raw)));
        } catch (e) {
          if (!cancelled) setError(formatBleFailure(e));
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
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

  const connectAdapter = () =>
    run("Подключение адаптера", async () => {
      setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()));
      const { name, elm } = await sessionRef.current.connectAdapter();
      setAdapterLabel(name);
      setElmVersion(elm.versionLine);
      setPhase(sessionRef.current.phase);
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
      setDtcs(list);
    });

  const clearDtcs = () =>
    run("Сброс кодов OBD", async () => {
      await sessionRef.current.clearObdDtcs();
      setDtcs([]);
    });

  const readEtacs = () =>
    run("Скачивание .kon / .cuf", async () => {
      const dump = await downloadMitsubishiEtacsCoding(sessionRef.current, profileId);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const names = etacsDownloadNames(`etacs_${stamp}`);
      await saveBlobToDevice(
        new Blob([Uint8Array.from(dump.variant)], { type: "application/octet-stream" }),
        names.kon,
      );
      await saveBlobToDevice(
        new Blob([Uint8Array.from(dump.custom)], { type: "application/octet-stream" }),
        names.cuf,
      );
      pushLog(`Файлы: ${names.kon}, ${names.cuf} (${dump.variant.length}+${dump.custom.length} байт)`);
    });

  const disconnect = () =>
    run("Отключение", async () => {
      await sessionRef.current.disconnect();
      setAdapterLabel(null);
      setElmVersion(null);
      setDtcs([]);
      setPids([]);
      setPidNote(null);
      setPoll(false);
      setPhase("idle");
    });

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-slate-950 px-4 py-6 text-slate-100">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-emerald-400/90">QHub</p>
        <h1 className="mt-1 text-2xl font-semibold">OBD Scanner (BLE)</h1>
        <p className="mt-1 text-xs text-slate-600">
          Актуальная страница · вкладки OBD-II, CAN / UDS и Mitsubishi ETACS
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Универсальные коды и параметры OBD-II. Раздел Mitsubishi — только выгрузка ETACS.
        </p>
      </header>

      <ConnectionPanel
        transport={transportReady ? transport : "…"}
        phase={phase}
        adapterLabel={adapterLabel}
        elmVersion={elmVersion}
        busy={busy}
        transportReady={transportReady}
        onConnectAdapter={connectAdapter}
        onConnectVehicle={connectVehicle}
        onDisconnect={disconnect}
      />

      {!transportReady ? (
        <p className="mb-4 text-sm text-slate-500">Проверка Bluetooth…</p>
      ) : null}

      {transportReady && transport === "none" ? (
        <div className="mb-4 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
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

      {transportReady && transport !== "none" && obdTransportHint(transport) ? (
        <p className="mb-4 text-xs text-slate-500">{obdTransportHint(transport)}</p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
      ) : null}

      <div className="mb-4 flex rounded-xl border border-slate-800 bg-slate-900/50 p-1">
        <TabButton active={tab === "obd"} onClick={() => setTab("obd")}>
          OBD-II
        </TabButton>
        <TabButton active={tab === "mitsubishi"} onClick={() => setTab("mitsubishi")}>
          Mitsubishi ETACS
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
      </div>

      {tab === "obd" ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">
            Subaru, Mitsubishi, Toyota и др. — стандарт SAE J1979 (mode 01 / 03). Бензин: в т.ч. STFT/LTFT.
          </p>
          <ActionButton disabled={busy || phase !== "vehicle"} onClick={readDtcs}>
            Считать коды ошибок
          </ActionButton>
          <ActionButton disabled={busy || phase !== "vehicle"} variant="ghost" onClick={clearDtcs}>
            Сбросить коды (mode 04)
          </ActionButton>
          <ActionButton disabled={busy || phase !== "vehicle"} onClick={() => setPoll((p) => !p)}>
            {poll ? "Остановить live-параметры" : "Live-параметры"}
          </ActionButton>
          {poll ? (
            <p className="text-xs text-slate-500">
              Обороты, скорость и дроссель обновляются каждый проход. Температуры, топливо и пробеги — реже.
            </p>
          ) : null}
          {dtcs.length > 0 ? <DtcList dtcs={dtcs} /> : null}
          {pidNote ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              {pidNote}
            </p>
          ) : null}
          {pids.length > 0 ? <PidGrid pids={pids} /> : null}
        </section>
      ) : tab === "mitsubishi" ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">
            Только Mitsubishi (MMCodingWriter). Не используйте на Subaru и других марках. Зажигание ON.
          </p>
          <label className="text-xs text-slate-400">Профиль CAN ETACS</label>
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            disabled={phase !== "vehicle"}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <ActionButton disabled={busy || phase !== "vehicle"} onClick={readEtacs}>
            Скачать .kon (variant) и .cuf (custom)
          </ActionButton>
        </section>
      ) : (
        <CanUdsPanel
          session={sessionRef.current}
          enabled={phase !== "idle"}
          linkLostTick={linkLostTick}
          onLog={pushLog}
        />
      )}

      {log.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-300">Журнал</h2>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-black/40 p-2 text-xs text-slate-400">
            {log.join("\n")}
          </pre>
        </section>
      ) : null}
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
  onConnectAdapter,
  onConnectVehicle,
  onDisconnect,
}: {
  transport: string;
  phase: ObdConnectionPhase;
  adapterLabel: string | null;
  elmVersion: string | null;
  busy: boolean;
  transportReady: boolean;
  onConnectAdapter: () => void;
  onConnectVehicle: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm">
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Транспорт</span>
        <span className="font-medium">{transport}</span>
      </div>
      <div className="mt-2 flex justify-between gap-2">
        <span className="text-slate-400">Этап</span>
        <span className="font-medium">{phaseLabels[phase]}</span>
      </div>
      {adapterLabel ? (
        <div className="mt-2 flex justify-between gap-2">
          <span className="text-slate-400">Адаптер</span>
          <span className="truncate font-medium">{adapterLabel}</span>
        </div>
      ) : null}
      {elmVersion ? <div className="mt-2 text-xs text-slate-500">{elmVersion}</div> : null}
      <div className="mt-4 flex flex-col gap-2">
        <ActionButton disabled={busy || !transportReady} onClick={onConnectAdapter}>
          1. Подключить vLinker (BLE)
        </ActionButton>
        <ActionButton disabled={busy || !transportReady || phase === "idle"} onClick={onConnectVehicle}>
          2. Подключиться к автомобилю
        </ActionButton>
        <ActionButton disabled={busy || !transportReady || phase === "idle"} variant="ghost" onClick={onDisconnect}>
          Отключить
        </ActionButton>
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

function DtcList({ dtcs }: { dtcs: { code: string }[] }) {
  return (
    <div className="mt-4">
      <h2 className="text-sm font-medium text-slate-300">Коды</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {dtcs.map((d) => (
          <li key={d.code} className="rounded-md bg-slate-900 px-3 py-2 font-mono">
            {d.code}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PidGrid({ pids }: { pids: { label: string; value: string; unit: string }[] }) {
  return (
    <div className="mt-4">
      <h2 className="text-sm font-medium text-slate-300">Параметры</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {pids.map((p) => (
          <li key={p.label} className="rounded-md bg-slate-900 px-3 py-2">
            <div className="text-xs text-slate-500">{p.label}</div>
            <div className="font-medium">
              {p.value} {p.unit}
            </div>
          </li>
        ))}
      </ul>
    </div>
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
