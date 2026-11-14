"use client";

import { useMemo, useState } from "react";
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import type { ModuleDtcReport } from "@/lib/obd/obd-session";
import {
  SUBARU_ALL_DTC_TARGETS,
  classifySubaruDtcStatus,
  getSubaruBlockScanStatus,
  isSubaruTxSafeToClear,
  sortSubaruScanReports,
  type SubaruBlockScanStatus,
} from "@/lib/obd/subaru-ssm4-modules";

export type SubaruFaultFilter = "all" | "faulted" | "clean" | "undetected";

interface Props {
  ready: boolean;
  busy: boolean;
  scanning: boolean;
  scanProgress: string | null;
  scanDoneCount: number;
  reportsByTx: Record<string, ModuleDtcReport>;
  onScanAll: () => void;
  onStopScan: () => void;
  onScanSingle: (txHex: string, rxHex: string, title: string) => void;
  onClearSingle: (txHex: string, rxHex: string, title: string) => void;
  onClearAllSafe: () => void;
  onOpenBlock: (systemId: string) => void;
  onExportCsv: () => void;
}

const STATUS_BADGE: Record<
  SubaruBlockScanStatus,
  { label: string; cls: string }
> = {
  current: {
    label: "Current",
    cls: "border-red-300 bg-red-600 text-white",
  },
  history: {
    label: "History",
    cls: "border-amber-300 bg-amber-500 text-white",
  },
  no_dtc: {
    label: "No DTC",
    cls: "border-emerald-300 bg-emerald-600 text-white",
  },
  unscanned: {
    label: "Ожидает",
    cls: "border-gray-300 bg-gray-100 text-gray-600",
  },
  not_detected: {
    label: "Не определён",
    cls: "border-gray-200 bg-gray-100 text-gray-500",
  },
};

export function SubaruAllFaultsView({
  ready,
  busy,
  scanning,
  scanProgress,
  scanDoneCount,
  reportsByTx,
  onScanAll,
  onStopScan,
  onScanSingle,
  onClearSingle,
  onClearAllSafe,
  onOpenBlock,
  onExportCsv,
}: Props) {
  const [filter, setFilter] = useState<SubaruFaultFilter>("all");
  const [confirmClearTx, setConfirmClearTx] = useState<{
    txHex: string;
    rxHex: string;
    title: string;
  } | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const entries = useMemo(() => {
    const raw = SUBARU_ALL_DTC_TARGETS.map((target) => {
      const txHex = target.tx.toString(16).toUpperCase();
      const rxHex = target.rx.toString(16).toUpperCase();
      const report = reportsByTx[txHex];
      return {
        target,
        txHex,
        rxHex,
        report,
        status: getSubaruBlockScanStatus(report),
      };
    });
    return sortSubaruScanReports(raw);
  }, [reportsByTx]);

  const counts = useMemo(() => {
    let current = 0;
    let history = 0;
    let clean = 0;
    let undetected = 0;
    let totalDtcs = 0;
    let safeClearableFaulted = 0;

    for (const item of entries) {
      if (item.status === "current") {
        current++;
      } else if (item.status === "history") {
        history++;
      } else if (item.status === "no_dtc") {
        clean++;
      } else if (item.status === "not_detected") {
        undetected++;
      }
      if (item.report && item.report.dtcs.length > 0) {
        totalDtcs += item.report.dtcs.length;
        if (isSubaruTxSafeToClear(item.txHex)) {
          safeClearableFaulted++;
        }
      }
    }
    return {
      current,
      history,
      faulted: current + history,
      clean,
      undetected,
      scanned: current + history + clean + undetected,
      totalDtcs,
      safeClearableFaulted,
    };
  }, [entries]);

  const visibleEntries = useMemo(() => {
    if (filter === "faulted") {
      return entries.filter((e) => e.status === "current" || e.status === "history");
    }
    if (filter === "clean") {
      return entries.filter((e) => e.status === "no_dtc");
    }
    if (filter === "undetected") {
      return entries.filter((e) => e.status === "not_detected");
    }
    return entries;
  }, [entries, filter]);

  const totalTargets = SUBARU_ALL_DTC_TARGETS.length;
  const progressPct = totalTargets > 0 ? Math.round((scanDoneCount / totalTargets) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Control Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900">
              All Systems Diagnosis · Сканирование всех блоков Subaru ({totalTargets})
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              Сначала показываются блоки с ошибками (Current → History), затем без ошибок (No DTC), внизу — не ответившие блоки.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scanning ? (
              <button
                type="button"
                onClick={onStopScan}
                className="rounded-lg border border-amber-600 bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Стоп ({scanDoneCount}/{totalTargets})
              </button>
            ) : (
              <button
                type="button"
                disabled={!ready || busy}
                onClick={onScanAll}
                className="rounded-lg border border-gray-900 bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Сканировать ошибки
              </button>
            )}
            {counts.safeClearableFaulted > 0 && !scanning && (
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => setConfirmClearAll(true)}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40"
              >
                Очистить безопасные ({counts.safeClearableFaulted})
              </button>
            )}
            {counts.scanned > 0 && (
              <button
                type="button"
                onClick={onExportCsv}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Экспорт CSV
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {(scanning || scanProgress) && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span className="truncate">{scanProgress ?? "Сканирование…"}</span>
              <span className="font-mono font-semibold">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-600 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary Counters & Filter */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === "all"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
            }`}
          >
            Все ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("faulted")}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === "faulted"
                ? "border-red-600 bg-red-600 text-white"
                : "border-red-200 bg-red-50 text-red-800 hover:border-red-300"
            }`}
          >
            С ошибками ({counts.faulted} · {counts.totalDtcs} DTC)
          </button>
          <button
            type="button"
            onClick={() => setFilter("clean")}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === "clean"
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
            }`}
          >
            No DTC ({counts.clean})
          </button>
          <button
            type="button"
            onClick={() => setFilter("undetected")}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === "undetected"
                ? "border-gray-700 bg-gray-700 text-white"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400"
            }`}
          >
            Не определены ({counts.undetected})
          </button>
        </div>
      </div>

      {/* Confirmation Banner for Single / All Clear */}
      {confirmClearTx && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950 space-y-2">
          <div className="font-bold">
            Очистить коды ошибок в блоке {confirmClearTx.title}?
          </div>
          <p className="text-[11px] text-red-800">
            Будет отправлена команда UDS `14 FF FF FF` (и Mode 04 для ECM/TCM). Убедитесь, что зажигание ON и причина неисправности устранена.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const target = confirmClearTx;
                setConfirmClearTx(null);
                onClearSingle(target.txHex, target.rxHex, target.title);
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Да, очистить DTC
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearTx(null)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {confirmClearAll && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950 space-y-2">
          <div className="font-bold">
            Очистить ошибки во всех безопасных блоках ({counts.safeClearableFaulted})?
          </div>
          <p className="text-[11px] text-red-800">
            Блоки EPS (746) и EyeSight (787) пропущены автоматически для защиты калибровок. После очистки будет выполнено повторное чтение.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmClearAll(false);
                onClearAllSafe();
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Да, очистить все безопасные
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearAll(false)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Sorted Module List */}
      <div className="space-y-2">
        {visibleEntries.map(({ target, txHex, rxHex, report, status }) => {
          const badge = STATUS_BADGE[status];
          const safeToClear = isSubaruTxSafeToClear(txHex);
          const isNotDetected = status === "not_detected";
          const hasDtcs = (report?.dtcs.length ?? 0) > 0;

          return (
            <article
              key={txHex}
              className={`rounded-xl border p-3 transition ${
                status === "current"
                  ? "border-red-300 bg-red-50/40"
                  : status === "history"
                    ? "border-amber-300 bg-amber-50/40"
                    : status === "no_dtc"
                      ? "border-emerald-200 bg-white"
                      : isNotDetected
                        ? "border-gray-200 bg-gray-50/60 opacity-65"
                        : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {target.nameEn}{" "}
                      <span className="font-mono text-xs text-gray-500">({target.abbr})</span>
                    </h4>
                    <span className="font-mono text-[11px] text-gray-400">
                      {txHex}→{rxHex}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                      {target.group}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {report
                      ? report.responded
                        ? report.dtcs.length === 0
                          ? "Ошибок не обнаружено (0 DTC)"
                          : `Обнаружено кодов неисправностей: ${report.dtcs.length}`
                        : "Блок не ответил / не установлен в данной комплектации"
                      : "Нажмите «Сканировать ошибки» для проверки блока"}
                    {report?.partNumber ? ` · Part: ${report.partNumber}` : ""}
                    {report?.systemName ? ` · ${report.systemName}` : ""}
                  </p>
                </div>

                {/* Per-block actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!ready || busy || scanning}
                    onClick={() => onScanSingle(txHex, rxHex, target.title)}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Считать
                  </button>
                  {safeToClear ? (
                    report?.responded || hasDtcs ? (
                      <button
                        type="button"
                        disabled={!ready || busy || scanning}
                        onClick={() =>
                          setConfirmClearTx({ txHex, rxHex, title: target.title })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                          hasDtcs
                            ? "border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Очистить DTC
                      </button>
                    ) : null
                  ) : (
                    <span
                      title="Сброс заблокирован для защиты калибровок SAS/EPS/EyeSight"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800"
                    >
                      Только чтение
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenBlock(target.primarySystemId)}
                    className="rounded-lg border border-gray-900 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                  >
                    Открыть блок →
                  </button>
                </div>
              </div>

              {/* DTC List inside card */}
              {report && report.dtcs.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {report.dtcs.map((dtc) => {
                    const sev = classifySubaruDtcStatus(dtc);
                    return (
                      <li
                        key={dtc.code}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gray-900">
                            {dtc.code}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              sev === "current"
                                ? "bg-red-100 text-red-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {sev === "current" ? "Current" : "History"}
                          </span>
                          {typeof dtc.statusByte === "number" && (
                            <span className="font-mono text-[10px] text-gray-400">
                              st 0x{dtc.statusByte.toString(16).padStart(2, "0").toUpperCase()}
                            </span>
                          )}
                          <span className="font-medium text-gray-800">
                            {dtc.description}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] leading-snug text-gray-500">
                          {dtc.remedy ?? remedyForDtcCode(dtc.code)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
