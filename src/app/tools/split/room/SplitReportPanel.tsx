"use client";

import { DEFAULT_CATEGORIES } from "@/lib/split/constants";
import type { SplitReport } from "@/lib/split/report";
import type { SplitRoomSnapshot } from "@/lib/split/types";

interface Props {
  snapshot: SplitRoomSnapshot;
  report: SplitReport;
}

function memberName(snapshot: SplitRoomSnapshot, id: string): string {
  return snapshot.members.find((m) => m.memberId === id)?.displayName ?? id.slice(0, 6);
}

function categoryLabel(categoryId: string): string {
  return DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.labelRu ?? categoryId;
}

function netColorClass(netBase: string): string {
  const v = Number(netBase);
  if (v > 0) return "text-teal-800 font-medium";
  if (v < 0) return "text-rose-700 font-medium";
  return "text-emerald-900/40";
}

export function SplitReportPanel({ snapshot, report }: Props) {
  const baseCurrency = snapshot.room.baseCurrency;
  const totalExpenses = Number(report.totalExpensesBase);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-900/10 bg-white/60 p-3 space-y-1">
        <p className="text-sm font-medium">
          Всего потрачено: {report.totalExpensesBase} {baseCurrency}
        </p>
        {Number(report.totalAssetsBase) !== 0 && (
          <p className="text-xs text-emerald-950/60">
            Остаток в кассе: {report.totalAssetsBase} {baseCurrency}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
          По статьям расходов
        </h3>
        {report.byCategory.length === 0 ? (
          <p className="text-sm text-emerald-950/45">Пока нет расходов</p>
        ) : (
          <ul className="space-y-2">
            {report.byCategory.map((c) => {
              const pct = totalExpenses > 0 ? (Number(c.totalBase) / totalExpenses) * 100 : 0;
              return (
                <li key={c.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{categoryLabel(c.categoryId)}</span>
                    <span className="font-medium tabular-nums">
                      {c.totalBase} {baseCurrency}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-emerald-900/10 overflow-hidden">
                    <div
                      className="h-full bg-teal-700"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
          По участникам
        </h3>
        <ul className="space-y-3">
          {report.members.map((m) => {
            const pendingNotes: string[] = [];
            if (m.pendingSettlementsOut > 0) {
              pendingNotes.push(
                `${m.pendingSettlementsOut} погашение(й) ждёт подтверждения от получателя`,
              );
            }
            if (m.pendingSettlementsIn > 0) {
              pendingNotes.push(`${m.pendingSettlementsIn} погашение(й) ждёт вашего подтверждения`);
            }
            if (m.pendingWithdrawalsIn > 0) {
              pendingNotes.push(`${m.pendingWithdrawalsIn} снятие(й) с кассы ждёт подтверждения`);
            }
            return (
              <li
                key={m.memberId}
                className="rounded-xl border border-emerald-900/10 bg-white/60 p-3 space-y-1.5 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{memberName(snapshot, m.memberId)}</span>
                  <span className={netColorClass(m.netBase)}>
                    {m.netBase} {baseCurrency}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-emerald-950/60">
                  <div className="flex justify-between gap-2">
                    <dt>Внёс / оплатил</dt>
                    <dd className="tabular-nums">{m.paidBase}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Его доля расходов</dt>
                    <dd className="tabular-nums">{m.shareBase}</dd>
                  </div>
                  {Number(m.contributedBase) > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt>Взносы в кассу</dt>
                      <dd className="tabular-nums">{m.contributedBase}</dd>
                    </div>
                  )}
                  {Number(m.withdrawnBase) > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt>Снял из кассы</dt>
                      <dd className="tabular-nums">{m.withdrawnBase}</dd>
                    </div>
                  )}
                  {Number(m.settledOutBase) > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt>Погасил долгов</dt>
                      <dd className="tabular-nums">{m.settledOutBase}</dd>
                    </div>
                  )}
                  {Number(m.settledInBase) > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt>Принял погашений</dt>
                      <dd className="tabular-nums">{m.settledInBase}</dd>
                    </div>
                  )}
                </dl>
                {pendingNotes.length > 0 && (
                  <p className="text-xs text-amber-800">{pendingNotes.join(" · ")}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
