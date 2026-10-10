"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiagnosticSession, type DiagnosticPhase } from "@/lib/obd/diagnostic-session";
import { getObdTransportKind } from "@/lib/obd/create-ble-link";
import { etacsDownloadNames } from "@/lib/obd/mitsubishi-etacs";
import { formatPidValue } from "@/lib/obd/obd2";
import { saveBlobToDevice } from "@/lib/platform/save-file";

const phaseLabels: Record<DiagnosticPhase, string> = {
  idle: "Не подключено",
  adapter: "Адаптер",
  vehicle: "Автомобиль",
};

export default function MitsubishiDiagClient() {
  const sessionRef = useRef(new DiagnosticSession());
  const [phase, setPhase] = useState<DiagnosticPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [elmVersion, setElmVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dtcs, setDtcs] = useState<{ code: string }[]>([]);
  const [pids, setPids] = useState<{ label: string; value: string; unit: string }[]>([]);
  const [profileId, setProfileId] = useState(sessionRef.current.listEtacsProfiles()[0]?.id ?? "");
  const [poll, setPoll] = useState(false);

  const transport = useMemo(() => getObdTransportKind(), []);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), line]);
  }, []);

  useEffect(() => {
    if (!poll || phase !== "vehicle") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const readings = await sessionRef.current.readLivePids();
        if (cancelled) return;
        setPids(
          readings.map((r) => ({
            label: r.def.label,
            unit: r.def.unit,
            value: formatPidValue(r.value, r.def.unit === "об/мин" ? 0 : 1),
          })),
        );
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [poll, phase]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      pushLog(`→ ${label}`);
      try {
        await fn();
        pushLog(`✓ ${label}`);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
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
      const { name, elm } = await sessionRef.current.connectAdapter();
      setAdapterLabel(name);
      setElmVersion(elm.versionLine);
      setPhase(sessionRef.current.phase);
    });

  const connectVehicle = () =>
    run("Связь с автомобилем (OBD)", async () => {
      await sessionRef.current.linkVehicle();
      setPhase(sessionRef.current.phase);
    });

  const readDtcs = () =>
    run("Чтение кодов OBD", async () => {
      const list = await sessionRef.current.readObdDtcs();
      setDtcs(list);
    });

  const readEtacs = () =>
    run("Скачивание variant/custom", async () => {
      const dump = await sessionRef.current.downloadEtacsCoding(profileId);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const names = etacsDownloadNames(`etacs_${stamp}`);
      await saveBlobToDevice(
        new Blob([Uint8Array.from(dump.variant)], { type: "application/octet-stream" }),
        names.variant,
      );
      await saveBlobToDevice(
        new Blob([Uint8Array.from(dump.custom)], { type: "application/octet-stream" }),
        names.custom,
      );
      pushLog(`Файлы: ${names.variant}, ${names.custom} (${dump.variant.length}+${dump.custom.length} байт)`);
    });

  const disconnect = () =>
    run("Отключение", async () => {
      await sessionRef.current.disconnect();
      setAdapterLabel(null);
      setElmVersion(null);
      setDtcs([]);
      setPids([]);
      setPoll(false);
      setPhase("idle");
    });

  const profiles = sessionRef.current.listEtacsProfiles();

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-slate-950 px-4 py-6 text-slate-100">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-emerald-400/90">QHub · Mitsubishi</p>
        <h1 className="mt-1 text-2xl font-semibold">Диагностика vLinker BLE</h1>
        <p className="mt-2 text-sm text-slate-400">
          Шаг 1 — адаптер, шаг 2 — OBD, затем коды, параметры и выгрузка .con / .cuf (как MMCodingWriter).
        </p>
      </header>

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
        {elmVersion ? (
          <div className="mt-2 text-xs text-slate-500">{elmVersion}</div>
        ) : null}
      </section>

      {transport === "none" ? (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Bluetooth недоступен здесь. На iPhone — Safari и vLinker BLE (Web Bluetooth). На Android — приложение
          QHub (Capacitor).
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <ActionButton disabled={busy || transport === "none"} onClick={connectAdapter}>
          1. Подключить vLinker (BLE)
        </ActionButton>
        <ActionButton disabled={busy || phase === "idle"} onClick={connectVehicle}>
          2. Подключиться к автомобилю
        </ActionButton>
        <ActionButton disabled={busy || phase !== "vehicle"} onClick={readDtcs}>
          Считать коды ошибок (OBD)
        </ActionButton>
        <ActionButton disabled={busy || phase !== "vehicle"} onClick={() => setPoll((p) => !p)}>
          {poll ? "Остановить параметры OBD" : "Показывать параметры OBD"}
        </ActionButton>

        <label className="mt-2 text-xs text-slate-400">Профиль ETACS (CAN)</label>
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
          Скачать variant (.con) и custom (.cuf)
        </ActionButton>
        <ActionButton disabled={busy || phase === "idle"} variant="ghost" onClick={disconnect}>
          Отключить
        </ActionButton>
      </div>

      {dtcs.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-300">Коды OBD</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {dtcs.map((d) => (
              <li key={d.code} className="rounded-md bg-slate-900 px-3 py-2 font-mono">
                {d.code}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pids.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-300">Параметры OBD</h2>
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
        </section>
      ) : null}

      {log.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-300">Журнал</h2>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-black/40 p-2 text-xs text-slate-400">
            {log.join("\n")}
          </pre>
        </section>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Зажигание ON, двигатель OFF. Перед записью в ETACS всегда сохраняйте бэкап. Формат .kon для дилерских
        прошивок — отдельный шаг (редактор); здесь бинарные .con / .cuf как в MMCodingWriter. Если чтение ETACS
        пустое — смените профиль CAN или сверьте лог с MMCodingWriter на ПК.
      </p>
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
