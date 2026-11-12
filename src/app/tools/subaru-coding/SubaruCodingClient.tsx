"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchAccessCheck } from "@/lib/messenger/client";
import { maskPhone } from "@/lib/messenger/phone-format";
import { formatBleFailure } from "@/lib/obd/ble-error";
import {
  ObdBleSession,
  type ObdConnectionPhase,
  type SubaruMeter12ColumnRead,
  type SubaruMeter12ColumnWriteSessionResult,
} from "@/lib/obd/obd-session";
import {
  SUBARU_CANADIAN_OPTION_PRESETS,
  decodeSubaruAppliedModel12Columns,
} from "@/lib/obd/subaru-ssm4-catalog";
import { formatObdEnvironmentLines, probeObdEnvironment } from "@/lib/obd/obd-environment";
import { obdTransportHint, useObdTransportKind } from "@/lib/obd/use-obd-transport";
import { SubaruImmoSection } from "./SubaruImmoSection";

type MainTab = "meter" | "immo";

const phaseLabels: Record<ObdConnectionPhase, string> = {
  idle: "Не подключено",
  adapter: "Адаптер подключён",
  vehicle: "Связь с ЭБУ",
};

export default function SubaruCodingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecking, setAuthChecking] = useState(true);
  const [loggedInPhone, setLoggedInPhone] = useState<string | null>(null);

  const [session] = useState(() => new ObdBleSession());
  const sessionRef = useRef(session);
  const [tab, setTab] = useState<MainTab>(() =>
    searchParams.get("tab") === "immo" ? "immo" : "meter",
  );
  const [phase, setPhase] = useState<ObdConnectionPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [elmVersion, setElmVersion] = useState<string | null>(null);
  const [supplyVolts, setSupplyVolts] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envLines, setEnvLines] = useState<string[] | null>(null);

  // Meter 12-column state
  const [appliedModelInput, setAppliedModelInput] = useState("BTAEYR8");
  const [optionCodeInput, setOptionCodeInput] = useState("U45L");
  const [meter12Read, setMeter12Read] = useState<SubaruMeter12ColumnRead | null>(null);
  const [meter12WriteResult, setMeter12WriteResult] =
    useState<SubaruMeter12ColumnWriteSessionResult | null>(null);
  const [meter12WritePending, setMeter12WritePending] = useState<{
    appliedModel: string;
    optionCode: string;
  } | null>(null);
  const [meter12SecurityKeyInput, setMeter12SecurityKeyInput] = useState("");

  const { transport, ready: transportReady } = useObdTransportKind();

  useEffect(() => {
    let active = true;
    void fetchAccessCheck()
      .then((res) => {
        if (!active) return;
        if (res.messengerLoggedIn && res.phone) {
          setLoggedInPhone(res.phone);
        } else {
          setLoggedInPhone(null);
        }
        setAuthChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setLoggedInPhone(null);
        setAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const s = sessionRef.current;
    s.setLinkLostHandler(() => {
      setPhase("idle");
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setBusy(false);
      setError("Связь с адаптером прервалась. Нажмите «Подключить vLinker» снова.");
    });
    return () => s.setLinkLostHandler(null);
  }, []);

  const connectOneStep = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
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
        await sessionRef.current.linkVehicle();
        setPhase(sessionRef.current.phase);
      } catch {
        /* Adapter connected — UDS 783 / 7B4 works even if 0100 fails */
      }
    } catch (e) {
      setError(formatBleFailure(e));
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await sessionRef.current.disconnect();
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, []);

  const appliedModelAnalysis = useMemo(
    () => decodeSubaruAppliedModel12Columns(appliedModelInput, optionCodeInput),
    [appliedModelInput, optionCodeInput],
  );

  const ready = phase !== "idle";

  const handleReadMeter12Column = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.readSubaruMeter12ColumnCode("6");
      setMeter12Read(result);
      if (result.match.actualAppliedModel && result.match.actualAppliedModel.length === 7) {
        setAppliedModelInput(result.match.actualAppliedModel);
      }
      if (result.match.actualOptionCode && result.match.actualOptionCode.length === 4) {
        setOptionCodeInput(result.match.actualOptionCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения приборки");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy]);

  const openMeterWriteModal = useCallback(
    (rawModel: string, rawOption: string) => {
      if (!ready || busy) return;
      const cleanModel =
        rawModel.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || "BTAEYR8";
      const cleanOpt =
        rawOption.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "C05L";
      setMeter12WritePending({ appliedModel: cleanModel, optionCode: cleanOpt });
    },
    [ready, busy],
  );

  const executeMeter12Write = useCallback(async () => {
    if (!ready || busy || !meter12WritePending) return;
    const pending = meter12WritePending;
    if (pending.appliedModel.trim().length !== 7 || pending.optionCode.trim().length !== 4) return;
    setMeter12WritePending(null);
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.writeSubaruMeter12ColumnCode(
        pending.appliedModel,
        pending.optionCode,
        "6",
        meter12SecurityKeyInput.trim() || undefined,
      );
      setMeter12WriteResult(result);
      if (result.after) setMeter12Read(result.after);
      else if (result.before) setMeter12Read(result.before);
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Запись не подтверждена приборкой.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка записи приборки");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12WritePending, meter12SecurityKeyInput]);

  if (authChecking) {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center text-sm text-gray-500">
        Проверка авторизации по номеру телефона…
      </div>
    );
  }

  if (!loggedInPhone) {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 space-y-4 text-center shadow-sm">
          <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            Защищённый сервис QHub
          </div>
          <h1 className="text-lg font-bold text-gray-900">
            Subaru Coding & Immobilizer
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Перевод показаний Subaru с °F на °C и иммобилайзер (чтение ключей, прописка ключей и регистрация автозапуска RES) доступны после входа по номеру телефона.
          </p>
          <button
            type="button"
            onClick={() => router.push("/tools/messenger/login?next=/tools/subaru-coding")}
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 text-sm font-semibold transition"
          >
            Войти по номеру телефона
          </button>
          <div className="pt-1 flex justify-center gap-3 text-xs text-gray-500">
            <Link href="/tools/obd-diag" className="underline hover:text-gray-800">
              ← В Subaru Diagnostics
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500">
            <span>QHub · Subaru Service</span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
              {maskPhone(loggedInPhone)}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Subaru Coding & Immobilizer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {supplyVolts != null && (
            <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-mono text-xs text-emerald-700">
              {supplyVolts.toFixed(1)} В
            </span>
          )}
          <Link
            href="/tools/obd-diag"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Subaru Diagnostics
          </Link>
        </div>
      </header>

      {/* Connection Bar */}
      {ready ? (
        <section className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>{adapterLabel ?? "vLinker"} · Подключён ({phaseLabels[phase]})</span>
            </div>
            {elmVersion && <div className="truncate text-[11px] text-gray-500">{elmVersion}</div>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-40"
          >
            Отключить
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-3.5 text-sm space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Транспорт: <strong className="text-gray-800">{transportReady ? transport : "…"}</strong>
            </span>
            <span className="font-medium text-gray-600">{phaseLabels[phase]}</span>
          </div>
          <button
            type="button"
            disabled={busy || !transportReady}
            onClick={() => void connectOneStep()}
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Подключить vLinker и автомобиль
          </button>
          {transportReady && transport === "none" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-1">
              <p>{obdTransportHint("none")}</p>
              <button
                type="button"
                className="underline"
                onClick={() => setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()))}
              >
                Показать диагностику Bluetooth
              </button>
              {envLines && <pre className="whitespace-pre-wrap text-[11px]">{envLines.join("\n")}</pre>}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {/* 2 Clean Main Tabs: 1) Приборка (°F → °C)  2) Иммобилайзер Subaru */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setTab("meter")}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
            tab === "meter" ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          °F → °C
        </button>
        <button
          type="button"
          onClick={() => setTab("immo")}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
            tab === "immo" ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Иммобилайзер Subaru (Ключи / RES)
        </button>
      </div>

      {tab === "meter" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Перевод с °F на °C
              </h2>
              <p className="text-xs text-gray-500">
                Считывание текущих единиц и перевод на градусы Цельсия.
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void handleReadMeter12Column()}
              className="rounded-xl bg-blue-800 hover:bg-blue-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              1. Считать текущие единицы
            </button>
          </div>

          {meter12Read && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="text-[10px] font-bold uppercase text-amber-900">
                  Сейчас
                </div>
                <div className="mt-1 font-mono text-base font-bold text-gray-900">
                  {meter12Read.match.actualAppliedModel} + {meter12Read.match.actualOptionCode}
                </div>
                <div className="text-[11px] text-amber-900">{meter12Read.match.actualRegion}</div>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                <div className="text-[10px] font-bold uppercase text-emerald-900">
                  Рекомендуемый канадский код (°C, км/ч)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-emerald-900">
                  {meter12Read.match.actualAppliedModel} + {meter12Read.match.recommendedCanadianOptionC0}
                </div>
                <div className="text-[11px] text-emerald-800">
                  Альтернатива PZEV: {meter12Read.match.recommendedCanadianOptionC5}
                </div>
              </div>
            </div>
          )}

          {/* Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-800">
                Applied Model (7 знаков со стойки B):
              </span>
              <input
                type="text"
                maxLength={7}
                value={appliedModelInput}
                onChange={(e) =>
                  setAppliedModelInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))
                }
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase text-gray-900"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-800">
                Option Code (4 знака — U45L / C05L / C05D):
              </span>
              <input
                type="text"
                maxLength={4}
                value={optionCodeInput}
                onChange={(e) =>
                  setOptionCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
                }
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase text-gray-900"
              />
            </label>
          </div>

          {/* Always-active Write Buttons when connected */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-emerald-950">
              2. Перевести на °C:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  openMeterWriteModal(
                    appliedModelAnalysis.appliedModel || "BTAEYR8",
                    appliedModelAnalysis.canadianOptionCodeC0 || "C05L",
                  )
                }
                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Записать Канада {appliedModelAnalysis.canadianOptionCodeC0} (°C, км/ч)
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  const rawSuffix =
                    optionCodeInput.trim().length === 4 ? optionCodeInput.trim().toUpperCase().slice(2, 4) : "5L";
                  const usSuffix =
                    rawSuffix === "QF"
                      ? appliedModelAnalysis.appliedModel.slice(5, 6) === "H"
                        ? "5B"
                        : "5D"
                      : rawSuffix === "RC" || rawSuffix === "RF"
                        ? "5L"
                        : rawSuffix;
                  openMeterWriteModal(appliedModelAnalysis.appliedModel || "BTAEYR8", `U4${usSuffix}`);
                }}
                className="rounded-xl border border-gray-400 bg-white hover:bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-900 disabled:opacity-40"
              >
                Вернуть США (U4
                {(() => {
                  const rawSuffix =
                    optionCodeInput.trim().length === 4 ? optionCodeInput.trim().toUpperCase().slice(2, 4) : "5L";
                  return rawSuffix === "QF"
                    ? appliedModelAnalysis.appliedModel.slice(5, 6) === "H"
                      ? "5B"
                      : "5D"
                    : rawSuffix === "RC" || rawSuffix === "RF"
                      ? "5L"
                      : rawSuffix;
                })()}{" "}
                · °F, мили)
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => openMeterWriteModal(appliedModelInput, optionCodeInput)}
                className="rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Записать из полей ({appliedModelInput || "BTAEYR8"}+{optionCodeInput || "U45L"})
              </button>
            </div>
            <div className="pt-1">
              <input
                type="text"
                value={meter12SecurityKeyInput}
                onChange={(e) => setMeter12SecurityKeyInput(e.target.value.toUpperCase())}
                placeholder="Опционально: свой Key для 27 04 (оставьте пустым для авто-расчёта)"
                className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase text-gray-900"
              />
            </div>
          </div>

          {meter12WriteResult && (
            <div
              className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                meter12WriteResult.success
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
              }`}
            >
              <div className="font-bold">
                {meter12WriteResult.success
                  ? `✓ Записано DID ${meter12WriteResult.writtenDid}: ${meter12WriteResult.plan.appliedModel} + ${meter12WriteResult.plan.optionCode}`
                  : "Запись остановлена"}
              </div>
              {meter12WriteResult.after && (
                <div>
                  После записи считано:{" "}
                  <code className="font-mono font-bold">
                    {meter12WriteResult.after.match.inferredAppliedModel} +{" "}
                    {meter12WriteResult.after.match.inferredOptionCode}
                  </code>{" "}
                  ({meter12WriteResult.after.match.inferredRegion})
                </div>
              )}
              <ul className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[10px] text-gray-700">
                {meter12WriteResult.steps.map((step, idx) => (
                  <li key={idx}>• {step}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Presets Table */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-gray-700">
              Быстрый выбор комплектации по кузову (нажмите на строку, чтобы подставить):
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-2.5 py-1.5">Модель</th>
                    <th className="px-2.5 py-1.5">Комплектация</th>
                    <th className="px-2.5 py-1.5">Applied Model</th>
                    <th className="px-2.5 py-1.5">США</th>
                    <th className="px-2.5 py-1.5">Канада (°C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {SUBARU_CANADIAN_OPTION_PRESETS.map((preset) => (
                    <tr
                      key={preset.id}
                      onClick={() => {
                        setAppliedModelInput(preset.appliedModel);
                        setOptionCodeInput(preset.canadianOptionCodeC0);
                      }}
                      className="cursor-pointer hover:bg-emerald-50"
                    >
                      <td className="px-2.5 py-1.5 font-semibold text-gray-800">
                        {preset.modelSeriesRu} <span className="text-gray-500">({preset.years})</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-700">{preset.trimRu}</td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                        {preset.appliedModel}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-gray-500">
                        {preset.usOptionCodeExamples.join(", ")}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                        {preset.canadianOptionCodeC0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <SubaruImmoSection
          session={session}
          ready={ready}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
        />
      )}

      {/* Clean Confirm Modal without 0205 */}
      {meter12WritePending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setMeter12WritePending(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-blue-900 bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
              <span>Перевод на °C</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Applied Model (7 симв.):</span>
                <input
                  type="text"
                  maxLength={7}
                  value={meter12WritePending.appliedModel}
                  onChange={(e) =>
                    setMeter12WritePending({
                      ...meter12WritePending,
                      appliedModel: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Option Code (4 симв.):</span>
                <input
                  type="text"
                  maxLength={4}
                  value={meter12WritePending.optionCode}
                  onChange={(e) =>
                    setMeter12WritePending({
                      ...meter12WritePending,
                      optionCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase"
                />
              </label>
            </div>
            <div className="rounded-lg bg-blue-50 p-2.5 font-mono text-xs text-blue-950 border border-blue-200">
              <div>Applied Model : <strong>{meter12WritePending.appliedModel}</strong></div>
              <div>Option Code   : <strong>{meter12WritePending.optionCode}</strong></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMeter12WritePending(null)}
                className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={
                  meter12WritePending.appliedModel.trim().length !== 7 ||
                  meter12WritePending.optionCode.trim().length !== 4
                }
                onClick={() => void executeMeter12Write()}
                className="rounded-xl bg-blue-900 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                OK — перевести на °C
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
