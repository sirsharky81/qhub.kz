"use client";

import { useEffect, useState } from "react";
import type { CatalogVehicle, CatalogVehicleSummary } from "@/lib/etacs-coding/diag-catalog";
import type { TpmsModuleReport } from "@/lib/obd/mitsubishi-modules";
import { asciiFromKwpPayload } from "@/lib/obd/mut-live";
import type { ObdBleSession, ObdConnectionPhase } from "@/lib/obd/obd-session";
import { MitsubishiTpmsRegisterCard } from "./MitsubishiTpmsRegisterCard";

interface Props {
  session: ObdBleSession;
  phase: ObdConnectionPhase;
  busy: boolean;
}

const WHEEL_LABELS = ["ПЛ", "ПП", "ЗП", "ЗЛ", "Запас"];

async function readDiagVin(session: ObdBleSession): Promise<string | null> {
  try {
    const identity = await session.readVehicleIdentity();
    if (identity.vin && identity.vin.length >= 11) return identity.vin;
  } catch {
    /* Mitsubishi often has no Mode 09 VIN */
  }
  for (const [tx, rx] of [
    ["7E0", "7E8"],
    ["620", "504"],
  ]) {
    try {
      const { parsed } = await session.sendUds("6", tx, rx, "21 90", false);
      if (parsed.kind !== "positive") continue;
      const vin = asciiFromKwpPayload(parsed.payload);
      if (vin) return vin;
    } catch {
      /* try the next module */
    }
  }
  return null;
}

export function MitsubishiTpmsPanel({ session, phase, busy }: Props) {
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<CatalogVehicleSummary[]>([]);
  const [vehicle, setVehicle] = useState<CatalogVehicle | null>(null);
  const [report, setReport] = useState<TpmsModuleReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/etacs-coding/diag");
        const body = (await response.json()) as { vehicles?: CatalogVehicleSummary[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Каталог недоступен");
        if (!cancelled) setVehicles(body.vehicles ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Каталог недоступен");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseVehicle = async (vkey: string) => {
    if (!vkey) {
      setVehicle(null);
      return;
    }
    setLocalBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/etacs-coding/diag?vkey=${encodeURIComponent(vkey)}`);
      const body = (await response.json()) as { error?: string; vehicle?: CatalogVehicle | null };
      if (!response.ok) throw new Error(body.error || "Каталог недоступен");
      setVehicle(body.vehicle ?? null);
      setStatus(body.vehicle?.nameRu ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setLocalBusy(false);
    }
  };

  const identify = async () => {
    setLocalBusy(true);
    setError(null);
    try {
      const vin = phase === "vehicle" ? await readDiagVin(session) : null;
      const query = vin ? `vin=${encodeURIComponent(vin)}` : "";
      const response = await fetch(`/api/etacs-coding/diag?${query}`);
      const body = (await response.json()) as {
        error?: string;
        vehicles?: CatalogVehicleSummary[];
        vehicle?: CatalogVehicle | null;
      };
      if (!response.ok) throw new Error(body.error || "Каталог недоступен");
      setVehicles(body.vehicles ?? []);
      setVehicle(body.vehicle ?? null);
      setStatus(
        body.vehicle
          ? body.vehicle.nameRu
          : vin
            ? "VIN не совпал с каталогом. Выберите машину."
            : "Выберите машину из каталога.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setLocalBusy(false);
    }
  };

  const readPressure = async () => {
    if (phase !== "vehicle" || busy || localBusy) return;
    setLocalBusy(true);
    setError(null);
    try {
      setReport(await session.readTpmsSensors("mitsubishi-auto"));
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "Нет ответа TPMS");
    } finally {
      setLocalBusy(false);
    }
  };

  const wheels = (report?.wheels ?? []).filter((wheel, index) => index < 4 || wheel.pressureBar != null || wheel.sensorIdHex);
  const locked = phase !== "vehicle" || busy || localBusy;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {phase !== "vehicle" ? (
        <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
          Подключите vLinker и установите связь с ЭБУ. Зажигание должно быть включено.
        </p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Давление шин</h3>
          <p className="mt-1 text-[11px] text-gray-500">
            Чтение с блока TPMS: Pajero Sport 773, Outlander и ASX 600, кузов 620 или 7A1.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {vehicles.length > 0 ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-gray-500">
              <span>Машина для прописки</span>
              <select
                value={vehicle?.vkey ?? ""}
                onChange={(event) => void chooseVehicle(event.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-900"
              >
                <option value="">Выберите</option>
                {vehicles.map((item) => (
                  <option key={item.vkey} value={item.vkey}>
                    {item.nameRu}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={localBusy}
            onClick={() => void identify()}
            className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            По VIN
          </button>
        </div>
        {status ? <p className="text-xs text-emerald-800">{status}</p> : null}

        <button
          type="button"
          disabled={locked}
          onClick={() => void readPressure()}
          className="rounded-lg border border-gray-900 px-3 py-1.5 text-[11px] font-medium text-gray-900 disabled:opacity-40"
        >
          {localBusy ? "Читаю…" : "Считать давление"}
        </button>
        {report ? (
          <p className="text-[11px] text-gray-500">
            {report.moduleName}
            {report.partNumber ? ` · ${report.partNumber}` : ""}
          </p>
        ) : (
          <p className="text-xs text-gray-500">Давление и ID появятся после чтения.</p>
        )}
        {wheels.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {wheels.map((wheel) => (
              <div key={wheel.wheelIndex} className="rounded-lg border border-gray-200 p-2">
                <div className="text-[10px] font-semibold text-gray-700">
                  {WHEEL_LABELS[wheel.wheelIndex - 1] ?? wheel.defaultLabel}
                </div>
                <div className="font-mono text-sm text-gray-900">
                  {wheel.pressureBar != null ? `${wheel.pressureBar.toFixed(2)} бар` : "—"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {wheel.temperatureC != null ? `${wheel.temperatureC} °C · ` : ""}
                  {wheel.sensorIdHex ? `ID ${wheel.sensorIdHex}` : wheel.statusText}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Прописать датчики</h3>
          <p className="mt-1 text-[11px] text-gray-500">
            Сначала выберите машину. Рецепт берётся по версии блока, который ответил на чтение.
          </p>
        </div>
        <MitsubishiTpmsRegisterCard
          session={session}
          phase={phase}
          vehicle={vehicle}
          disabled={locked}
          onReport={setReport}
        />
      </div>
    </section>
  );
}
