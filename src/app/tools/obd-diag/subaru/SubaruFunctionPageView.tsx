"use client";

import { useState } from "react";
import type { ObdBleSession } from "@/lib/obd/obd-session";
import { formatUdsPayload } from "@/lib/obd/uds";
import type { Ssm4SystemEntry } from "@/lib/obd/subaru-ssm4-catalog";
import type {
  SubaruActiveTestItem,
  SubaruCancelCodeSpec,
  SubaruWorkSupportItem,
} from "@/lib/obd/subaru-ssm4-modules";
import { SteeringCalConfirmDialog } from "../SteeringCalConfirmDialog";

export type SelectedBlockFunction =
  | { kind: "work-support"; item: SubaruWorkSupportItem }
  | { kind: "active-test"; item: SubaruActiveTestItem }
  | { kind: "cancel-code"; item: SubaruCancelCodeSpec };

interface Props {
  system: Ssm4SystemEntry;
  selectedFn: SelectedBlockFunction;
  session: ObdBleSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  onBack: () => void;
}

export function SubaruFunctionPageView({
  system,
  selectedFn,
  session,
  ready,
  busy,
  setBusy,
  setError,
  onBack,
}: Props) {
  const [monitorValues, setMonitorValues] = useState<
    Array<{ didHex: string; labelRu: string; text: string }>
  >([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [steeringConfirmOpen, setSteeringConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    summaries: string[];
    steps: string[];
  } | null>(null);

  const monitorList =
    selectedFn.kind === "work-support"
      ? selectedFn.item.liveDids ?? []
      : selectedFn.kind === "active-test"
        ? selectedFn.item.monitorDids
        : [];

  const readMonitors = async () => {
    if (!ready || monitorList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 03", false);
      } catch {
        /* optional */
      }
      const rows: Array<{ didHex: string; labelRu: string; text: string }> = [];
      for (const m of monitorList) {
        const cleanDid = m.didHex.replace(/\s+/g, "").toUpperCase();
        const isObd = cleanDid.startsWith("F4") && cleanDid.length === 4;
        const cmd = isObd ? `01 ${cleanDid.slice(2)}` : `22 ${cleanDid.slice(0, 2)} ${cleanDid.slice(2)}`;
        const sid = isObd ? 0x01 : 0x22;
        try {
          const { parsed } = await session.sendUds("6", system.txHex, system.rxHex, cmd, false);
          rows.push({
            didHex: cleanDid,
            labelRu: m.labelRu,
            text:
              parsed.kind === "positive"
                ? formatUdsPayload(parsed.payload, sid, system.txHex)
                : parsed.kind === "negative"
                  ? `Отказ: ${parsed.nrcText ?? "NRC"}`
                  : "Нет ответа",
          });
        } catch (err) {
          rows.push({
            didHex: cleanDid,
            labelRu: m.labelRu,
            text: err instanceof Error ? err.message : "Ошибка",
          });
        }
      }
      try {
        await session.sendUds("6", system.txHex, system.rxHex, "10 01", false);
      } catch {
        /* ignore */
      }
      setMonitorValues(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось прочитать контрольные DID");
    } finally {
      setBusy(false);
    }
  };

  const runWorkSupport = async (item: SubaruWorkSupportItem) => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (item.serviceActionId) {
        const res = await session.runSubaruServiceAction(item.serviceActionId);
        setResult({
          success: res.success,
          summaries:
            res.finalAngleDeg != null
              ? [`Итоговый угол руля: ${res.finalAngleDeg.toFixed(1)}°`]
              : [],
          steps: res.steps,
        });
      } else if (item.payloads && item.payloads.length > 0) {
        const res = await session.runSubaruUdsProcedure({
          txHex: item.txHex,
          rxHex: item.rxHex,
          payloads: item.payloads,
          stopOnWriteSuccess: item.stopOnWriteSuccess ?? true,
          requireCgwFilterRemove: item.requireCgwFilterRemove ?? false,
          autoSecurityAccess: true,
        });
        setResult({
          success: res.success,
          summaries: res.decodedSummaries,
          steps: res.steps,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка выполнения процедуры");
    } finally {
      setBusy(false);
    }
  };

  const runActiveTest = async (
    item: SubaruActiveTestItem,
    mode: "on" | "off" | "read",
  ) => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "on" && item.onPayloads?.length) {
        const res = await session.runSubaruUdsProcedure({
          txHex: item.txHex,
          rxHex: item.rxHex,
          payloads: item.onPayloads,
          stopOnWriteSuccess: true,
          autoSecurityAccess: true,
        });
        setResult({
          success: res.success,
          summaries: res.decodedSummaries,
          steps: res.steps,
        });
      } else if (mode === "off" && item.offPayloads?.length) {
        const res = await session.runSubaruUdsProcedure({
          txHex: item.txHex,
          rxHex: item.rxHex,
          payloads: item.offPayloads,
          stopOnWriteSuccess: true,
          autoSecurityAccess: true,
        });
        setResult({
          success: res.success,
          summaries: res.decodedSummaries,
          steps: res.steps,
        });
      }
      if (item.monitorDids.length > 0) {
        try {
          await session.sendUds("6", item.txHex, item.rxHex, "10 03", false);
        } catch {
          /* ignore */
        }
        const rows: Array<{ didHex: string; labelRu: string; text: string }> = [];
        for (const m of item.monitorDids) {
          const cleanDid = m.didHex.replace(/\s+/g, "").toUpperCase();
          const isObd = cleanDid.startsWith("F4") && cleanDid.length === 4;
          const cmd = isObd ? `01 ${cleanDid.slice(2)}` : `22 ${cleanDid.slice(0, 2)} ${cleanDid.slice(2)}`;
          const sid = isObd ? 0x01 : 0x22;
          try {
            const { parsed } = await session.sendUds("6", item.txHex, item.rxHex, cmd, false);
            rows.push({
              didHex: cleanDid,
              labelRu: m.labelRu,
              text:
                parsed.kind === "positive"
                  ? formatUdsPayload(parsed.payload, sid, item.txHex)
                  : "Нет ответа / отказ",
            });
          } catch {
            rows.push({ didHex: cleanDid, labelRu: m.labelRu, text: "Ошибка" });
          }
        }
        setMonitorValues(rows);
        if (mode === "read") {
          setResult({
            success: rows.some((r) => !r.text.includes("Нет ответа") && !r.text.includes("Ошибка")),
            summaries: rows.map((r) => `${r.labelRu}: ${r.text}`),
            steps: rows.map((r) => `${item.txHex} DID ${r.didHex} → ${r.text}`),
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка выполнения активного теста");
    } finally {
      setBusy(false);
    }
  };

  const runCancelCode = async (item: SubaruCancelCodeSpec) => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await session.runSubaruUdsProcedure({
        txHex: item.txHex,
        rxHex: item.rxHex,
        payloads: item.readPayloads,
        stopOnWriteSuccess: false,
        requireCgwFilterRemove: item.txHex === "787",
        autoSecurityAccess: true,
      });
      setResult({
        success: res.success,
        summaries: res.decodedSummaries,
        steps: res.steps,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения Cancel Code");
    } finally {
      setBusy(false);
    }
  };

  const badgeLabel =
    selectedFn.kind === "work-support"
      ? "F5 Work Support"
      : selectedFn.kind === "active-test"
        ? "F4 Active Test"
        : "F2 Cancel Code";

  return (
    <div className="space-y-3">
      {/* Top Breadcrumb + Back Button */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
          >
            ← Назад к функциям ({system.abbr})
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-gray-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
              {badgeLabel}
            </span>
            <span className="font-mono text-[11px] text-gray-500">
              {system.txHex}→{system.rxHex}
            </span>
            {selectedFn.kind === "work-support" && selectedFn.item.srpRef && (
              <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                {selectedFn.item.srpRef}
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-gray-900">{selectedFn.item.nameEn}</h3>
          <p className="text-xs font-medium text-gray-600">{selectedFn.item.nameRu}</p>
        </div>

        {/* SSM4 Explanation & Conditions panels */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Explanation (Описание SSM4)
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-800">
              {selectedFn.item.explanationRu}
            </p>
          </div>
          {selectedFn.kind !== "cancel-code" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Conditions (Условия выполнения)
              </div>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs text-amber-950">
                {selectedFn.item.conditionsRu.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Live Control Monitors (e.g. CVTF temp, Steering Angle) */}
        {monitorList.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-800">
                Контрольные параметры блока ({monitorList.length})
              </span>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void readMonitors()}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-40"
              >
                Считать параметры
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {monitorList.map((m) => {
                const val = monitorValues.find((v) => v.didHex === m.didHex.toUpperCase());
                return (
                  <div
                    key={m.didHex}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{m.labelRu}</span>
                      <span className="font-mono">DID {m.didHex}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-gray-900">
                      {val?.text ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {selectedFn.kind === "work-support" && (
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => {
                const item = selectedFn.item;
                if (item.serviceActionId === "vdc-steering-zero") {
                  setSteeringConfirmOpen(true);
                } else if (item.confirmRequired) {
                  setConfirmOpen(true);
                } else {
                  void runWorkSupport(item);
                }
              }}
              className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {selectedFn.item.category === "read"
                ? "Считать данные"
                : "Выполнить процедуру"}
            </button>
          )}

          {selectedFn.kind === "active-test" && (
            <>
              {selectedFn.item.onPayloads?.length ? (
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void runActiveTest(selectedFn.item, "on")}
                  className="rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
                >
                  Включить тест (ON)
                </button>
              ) : null}
              {selectedFn.item.offPayloads?.length ? (
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void runActiveTest(selectedFn.item, "off")}
                  className="rounded-lg border border-amber-600 bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
                >
                  Выключить тест (OFF)
                </button>
              ) : null}
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void runActiveTest(selectedFn.item, "read")}
                className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Опросить статус привода
              </button>
            </>
          )}

          {selectedFn.kind === "cancel-code" && (
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void runCancelCode(selectedFn.item)}
              className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Считать коды отмены
            </button>
          )}

          {!ready && (
            <span className="text-[11px] text-amber-700">
              Подключите адаптер и автомобиль (Зажигание ON) для выполнения.
            </span>
          )}
        </div>
      </div>

      {/* Confirm modal for state-changing Work Support */}
      {confirmOpen && selectedFn.kind === "work-support" && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-3.5 text-xs space-y-2">
          <div className="font-bold text-amber-950">
            Подтвердить выполнение «{selectedFn.item.nameEn}»?
          </div>
          <p className="text-amber-900">
            Проверьте все условия (Conditions) выше. Процедура отправит сервисную команду в блок{" "}
            <span className="font-mono font-bold">{selectedFn.item.txHex}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                void runWorkSupport(selectedFn.item);
              }}
              className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
            >
              Да, выполнить
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-800"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <SteeringCalConfirmDialog
        brand="subaru"
        open={steeringConfirmOpen}
        onCancel={() => setSteeringConfirmOpen(false)}
        onConfirm={() => {
          setSteeringConfirmOpen(false);
          if (selectedFn.kind === "work-support") {
            void runWorkSupport(selectedFn.item);
          }
        }}
      />

      {/* Execution Result & UDS Trace */}
      {result && (
        <div
          className={`rounded-xl border p-3.5 space-y-2 text-xs ${
            result.success
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="font-bold">
            {result.success
              ? "Процедура выполнена / ответ получен"
              : "Блок не подтвердил процедуру (см. детали ниже)"}
          </div>
          {result.summaries.length > 0 && (
            <ul className="space-y-1 font-mono text-[11px] font-semibold">
              {result.summaries.map((line, i) => (
                <li key={i} className="rounded bg-white/80 px-2 py-1 border border-emerald-200/70">
                  {line}
                </li>
              ))}
            </ul>
          )}
          <details open={!result.success} className="pt-1">
            <summary className="cursor-pointer text-[11px] font-semibold opacity-80">
              Протокол обмена UDS ({result.steps.length} шагов)
            </summary>
            <pre className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/90 p-2 font-mono text-[10px] text-gray-800 border border-gray-200">
              {result.steps.join("\n")}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
