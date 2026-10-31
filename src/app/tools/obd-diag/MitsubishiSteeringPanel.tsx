"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ObdBleSession, ObdConnectionPhase } from "@/lib/obd/obd-session";
import type { SasCalibrationResult } from "@/lib/obd/mitsubishi-modules";
import { SteeringCalConfirmDialog } from "./SteeringCalConfirmDialog";

interface Props {
  session: ObdBleSession;
  phase: ObdConnectionPhase;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
}

type MitsuSteeringSource = "mitsu-622" | "mitsu-784";

export function MitsubishiSteeringPanel({
  session,
  phase,
  busy,
  setBusy,
  setError,
}: Props) {
  const ready = phase !== "idle";
  const [steeringRunning, setSteeringRunning] = useState(false);
  const [steeringSource, setSteeringSource] = useState<MitsuSteeringSource>("mitsu-622");
  const [steeringData, setSteeringData] = useState<{
    angleDeg: number;
    rawHex: string;
    angularSpeedDegPerSec: number | null;
    calibrated: boolean | null;
    sourceLabel: string;
    ticks: number;
  } | null>(null);
  const [sasCalResult, setSasCalResult] = useState<SasCalibrationResult | null>(null);
  const [calConfirmOpen, setCalConfirmOpen] = useState(false);
  const stopSteeringRef = useRef(false);

  useEffect(() => {
    return () => {
      stopSteeringRef.current = true;
    };
  }, []);

  const stopSteeringMonitor = useCallback(() => {
    stopSteeringRef.current = true;
  }, []);

  const startSteeringMonitor = useCallback(async () => {
    if (!ready || busy) return;
    stopSteeringRef.current = false;
    setSteeringRunning(true);
    setBusy(true);
    setError(null);
    const src = steeringSource === "mitsu-622" ? "sas-622" : "abs-784";
    try {
      let ticks = 0;
      while (!stopSteeringRef.current) {
        ticks += 1;
        try {
          const mitsu = await session.readMitsubishiSteeringAngle(src);
          setSteeringData({
            angleDeg: mitsu.angleDeg,
            rawHex: mitsu.rawHex,
            angularSpeedDegPerSec: mitsu.angularSpeedDegPerSec,
            calibrated: mitsu.calibrated,
            sourceLabel: `${mitsu.txHex} → ${mitsu.rxHex}`,
            ticks,
          });
        } catch {
          /* continue polling */
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setSteeringRunning(false);
      setBusy(false);
    }
  }, [ready, busy, steeringSource, session, setBusy, setError]);

  const executeSasZeroCalibration = useCallback(async () => {
    setCalConfirmOpen(false);
    setBusy(true);
    setError(null);
    setSasCalResult(null);
    try {
      const res = await session.calibrateMitsubishiSasZero();
      setSasCalResult(res);
      if (!res.success) {
        setError("Калибровка SAS завершилась с ошибкой — см. шаги ниже");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка калибровки нуля руля SAS");
    } finally {
      setBusy(false);
    }
  }, [session, setBusy, setError]);

  const requestSasZeroCalibration = useCallback(() => {
    if (!ready || busy || steeringRunning) return;
    setCalConfirmOpen(true);
  }, [ready, busy, steeringRunning]);

  return (
    <section className="relative flex flex-col gap-3">
      <SteeringCalConfirmDialog
        brand="mitsubishi"
        open={calConfirmOpen}
        onCancel={() => setCalConfirmOpen(false)}
        onConfirm={() => void executeSasZeroCalibration()}
      />

      {phase !== "vehicle" ? (
        <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
          Подключите vLinker и установите связь с ЭБУ, затем выберите блок SAS (622) или ABS/VDC (784).
        </p>
      ) : null}

      <div className="rounded-xl border border-emerald-300 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-emerald-700">
              Угол поворота руля Mitsubishi (SAS / ABS)
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Live-опрос KWP <strong>21 01–04</strong> на <strong>622 → 484</strong> (SAS) или{" "}
              <strong>784 → 785</strong> (ABS/ASC). Цель для сход-развала — около <strong>0.0°</strong>.
            </p>
          </div>
          <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
            0.1°
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={steeringRunning || busy}
            onClick={() => setSteeringSource("mitsu-622")}
            className={`rounded-lg px-2 py-2 text-xs font-medium disabled:opacity-40 ${
              steeringSource === "mitsu-622"
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-gray-50 text-gray-700"
            }`}
          >
            SAS 622 → 484
          </button>
          <button
            type="button"
            disabled={steeringRunning || busy}
            onClick={() => setSteeringSource("mitsu-784")}
            className={`rounded-lg px-2 py-2 text-xs font-medium disabled:opacity-40 ${
              steeringSource === "mitsu-784"
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-gray-50 text-gray-700"
            }`}
          >
            ABS / VDC 784 → 785
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          {steeringData ? (
            <>
              <div className="text-[11px] uppercase tracking-wider text-gray-500">
                Текущий угол ({steeringData.sourceLabel})
              </div>
              <div
                className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
                  Math.abs(steeringData.angleDeg) <= 0.5
                    ? "text-emerald-600"
                    : Math.abs(steeringData.angleDeg) <= 2.5
                      ? "text-amber-800"
                      : "text-rose-400"
                }`}
              >
                {steeringData.angleDeg > 0 ? "+" : ""}
                {steeringData.angleDeg.toFixed(1)}°
              </div>
              <div className="mt-1 text-xs font-medium">
                {Math.abs(steeringData.angleDeg) <= 0.3 ? (
                  <span className="text-emerald-600">Руль по центру (±0.3°)</span>
                ) : steeringData.angleDeg < 0 ? (
                  <span className="text-amber-800">
                    Вправо {Math.abs(steeringData.angleDeg).toFixed(1)}° — подкрутите к 0.0°
                  </span>
                ) : (
                  <span className="text-amber-800">
                    Влево {steeringData.angleDeg.toFixed(1)}° — подкрутите к 0.0°
                  </span>
                )}
              </div>
              <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-emerald-400/80" />
                <div
                  className={`absolute top-0.5 h-2 w-3 -translate-x-1/2 rounded-full transition-all ${
                    Math.abs(steeringData.angleDeg) <= 0.5 ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                  style={{
                    left: `${Math.max(4, Math.min(96, 50 - (steeringData.angleDeg / 15) * 45))}%`,
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-200 pt-2.5 text-left font-mono text-[11px]">
                <div>
                  <div className="font-sans text-[10px] text-gray-500">Raw</div>
                  <div className="text-gray-800">{steeringData.rawHex}</div>
                </div>
                <div>
                  <div className="font-sans text-[10px] text-gray-500">Скорость</div>
                  <div className="text-gray-800">
                    {steeringData.angularSpeedDegPerSec != null
                      ? `${steeringData.angularSpeedDegPerSec} °/с`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[10px] text-gray-500">Калибровка</div>
                  <div className="text-gray-800">
                    {steeringData.calibrated === true
                      ? "OK"
                      : steeringData.calibrated === false
                        ? "Нужен 0°"
                        : "—"}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-4 text-xs text-gray-500">
              Выберите блок SAS или ABS и запустите live-опрос.
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {!steeringRunning ? (
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void startSteeringMonitor()}
              className="flex-1 rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              Запустить live (0.0°)
            </button>
          ) : (
            <button
              type="button"
              onClick={stopSteeringMonitor}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-3 text-xs font-semibold text-white"
            >
              Остановить
            </button>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-950/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-900">
              Калибровка нуля SAS (622 → 484 + 784 → 785)
            </span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-800">
              KWP 31 02 / 31 01
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-700">
            После сход-развала или снятия руля: фиксация нулевой точки на SAS и перезапуск VDC. Только при руле строго
            по центру.
          </p>
          <button
            type="button"
            disabled={!ready || busy || steeringRunning}
            onClick={requestSasZeroCalibration}
            className="mt-2.5 w-full rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Калибровка нуля (0.0°)
          </button>
          {sasCalResult ? (
            <div
              className={`mt-2.5 rounded-lg border p-2.5 text-xs ${
                sasCalResult.success
                  ? "border-emerald-500/50 bg-emerald-50 text-emerald-800"
                  : "border-rose-500/50 bg-rose-950/30 text-rose-200"
              }`}
            >
              <div className="font-semibold">
                {sasCalResult.success ? "Калибровка выполнена" : "Ошибка калибровки"}
              </div>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-gray-700">
                {sasCalResult.steps.map((s, idx) => (
                  <li key={idx}>• {s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
