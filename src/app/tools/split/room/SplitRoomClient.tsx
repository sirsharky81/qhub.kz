"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  apiArchiveRoom,
  apiConfirmSettlement,
  apiCreateExpense,
  apiCreateInvite,
  apiCreateSettlement,
  apiDeleteExpense,
  apiExportCsv,
  apiGetLedger,
  apiGetReport,
  apiGetSnapshot,
  apiSetRates,
} from "@/lib/split/client";
import { DEFAULT_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/split/constants";
import type { SplitReport } from "@/lib/split/report";
import { clearSplitSession, loadSplitSession } from "@/lib/split/session";
import type { SplitLedgerResponse, SplitMethod, SplitRoomSnapshot, SplitSession } from "@/lib/split/types";
import { SplitShell } from "../components/SplitShell";
import { SplitAdvancedPanel } from "./SplitAdvancedPanel";
import { SplitParticipantsPanel } from "./SplitParticipantsPanel";
import { SplitReportPanel } from "./SplitReportPanel";

function memberName(snapshot: SplitRoomSnapshot, id: string): string {
  return snapshot.members.find((m) => m.memberId === id)?.displayName ?? id.slice(0, 6);
}

export default function SplitRoomClient() {
  const router = useRouter();
  const [session] = useState<SplitSession | null>(() => loadSplitSession());
  const [snapshot, setSnapshot] = useState<SplitRoomSnapshot | null>(null);
  const [ledger, setLedger] = useState<SplitLedgerResponse | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [report, setReport] = useState<SplitReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KZT");
  const [categoryId, setCategoryId] = useState("food");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [excludePayer, setExcludePayer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paidByMemberId, setPaidByMemberId] = useState<string>("");
  const [fxCurrency, setFxCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("");

  const refresh = useCallback(async (
    s: SplitSession,
    opts?: { withLedger?: boolean; withReport?: boolean },
  ) => {
    const next = await apiGetSnapshot(s);
    setSnapshot(next);
    setCurrency(next.room.baseCurrency);
    if (selectedIds.length === 0) {
      setSelectedIds(next.members.map((m) => m.memberId));
    }
    if (!paidByMemberId) {
      setPaidByMemberId(s.memberId);
    } else if (!next.members.some((m) => m.memberId === paidByMemberId)) {
      setPaidByMemberId(s.memberId);
    }
    const needLedger = opts?.withLedger ?? next.room.advancedAccounting ?? false;
    if (needLedger) {
      const ledgerData = await apiGetLedger(s);
      setLedger(ledgerData);
      if (ledgerData.room.advancedAccounting) {
        setShowAdvanced(true);
      }
    } else {
      setLedger(null);
    }
    const needReport = opts?.withReport ?? showReport;
    if (needReport) {
      setReport(await apiGetReport(s));
    }
  }, [selectedIds.length, paidByMemberId, showReport]);

  useEffect(() => {
    if (!session) {
      router.replace("/tools/split");
      return;
    }
    startTransition(async () => {
      try {
        await refresh(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      }
    });
    // Initial load only — refresh identity is intentionally omitted to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, session?.roomId, session?.memberId]);

  const participantInputs = useMemo(() => {
    let ids = selectedIds;
    if (excludePayer && paidByMemberId) {
      ids = ids.filter((id) => id !== paidByMemberId);
    }
    if (ids.length === 0 && snapshot) {
      ids = snapshot.members.map((m) => m.memberId);
    }
    if (splitMethod === "equal") {
      return ids.map((memberId) => ({ memberId }));
    }
    if (splitMethod === "percentage") {
      const each = (100 / Math.max(ids.length, 1)).toFixed(2);
      // Last gets remainder to 100.00 — validated server-side; approximate client values.
      return ids.map((memberId, i) => ({
        memberId,
        inputValue: i === ids.length - 1
          ? (100 - Number(each) * (ids.length - 1)).toFixed(2)
          : each,
      }));
    }
    if (splitMethod === "shares") {
      return ids.map((memberId) => ({ memberId, inputValue: "1" }));
    }
    // fixed: equal split of entered amount as default
    const n = Math.max(ids.length, 1);
    const each = amount ? (Number(amount) / n).toFixed(2) : "0.00";
    return ids.map((memberId, i) => ({
      memberId,
      inputValue:
        i === n - 1 && amount
          ? (Number(amount) - Number(each) * (n - 1)).toFixed(2)
          : each,
    }));
  }, [selectedIds, excludePayer, paidByMemberId, snapshot, splitMethod, amount]);

  const canEditAsOwner =
    session?.role === "owner" ||
    Boolean(
      snapshot &&
        snapshot.members.some(
          (m) => m.memberId === snapshot.room.ownerMemberId && m.status !== "connected",
        ),
    );

  if (!session) {
    return (
      <SplitShell title="Комната" backHref="/tools/split">
        <div className="p-4 text-sm text-emerald-950/60">Загрузка…</div>
      </SplitShell>
    );
  }

  return (
    <SplitShell
      title={snapshot?.room.name ?? "Комната"}
      subtitle={
        snapshot
          ? `${snapshot.room.baseCurrency} · v${snapshot.version}${
              snapshot.room.status === "archived" ? " · архив" : ""
            }`
          : session.displayName
      }
      backHref="/tools/split"
      trailing={
        <button
          type="button"
          className="text-xs text-emerald-900/50 px-2"
          onClick={() => {
            clearSplitSession();
            router.replace("/tools/split");
          }}
        >
          Выйти
        </button>
      }
    >
      <div className="p-4 space-y-6">
        {error && <p className="text-sm text-rose-700">{error}</p>}

        {snapshot && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Баланс
            </h2>
            <ul className="space-y-1.5">
              {snapshot.balances.map((b) => (
                <li
                  key={b.memberId}
                  className="flex items-center justify-between text-sm py-1 border-b border-emerald-900/5"
                >
                  <span>{memberName(snapshot, b.memberId)}</span>
                  <span
                    className={
                      Number(b.netBase) > 0
                        ? "text-teal-800 font-medium"
                        : Number(b.netBase) < 0
                          ? "text-rose-700 font-medium"
                          : "text-emerald-900/40"
                    }
                  >
                    {b.netBase} {snapshot.room.baseCurrency}
                  </span>
                </li>
              ))}
            </ul>
            {snapshot.expensesLocked && (
              <p className="text-xs text-amber-800">
                Есть погашения — старые расходы заблокированы. Добавляйте корректирующие.
              </p>
            )}
          </section>
        )}

        {snapshot && (
          <SplitParticipantsPanel
            session={session}
            snapshot={snapshot}
            pending={pending}
            inviteUrl={inviteUrl}
            onInviteUrl={setInviteUrl}
            onRefresh={() => refresh(session, { withLedger: showAdvanced })}
            onError={setError}
            startAction={(fn) => {
              setError(null);
              startTransition(fn);
            }}
          />
        )}

        {snapshot && snapshot.suggestions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Рекомендуемые погашения
            </h2>
            <ul className="space-y-2">
              {snapshot.suggestions.map((s) => (
                <li
                  key={`${s.fromMemberId}-${s.toMemberId}-${s.amountBase}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {memberName(snapshot, s.fromMemberId)} → {memberName(snapshot, s.toMemberId)}:{" "}
                    <strong>
                      {s.amountBase} {snapshot.room.baseCurrency}
                    </strong>
                  </span>
                  {snapshot.room.status === "open" && (
                    <button
                      type="button"
                      disabled={pending}
                      className="shrink-0 rounded-lg bg-teal-800 text-white px-2.5 py-1.5 text-xs"
                      onClick={() => {
                        setError(null);
                        startTransition(async () => {
                          try {
                            await apiCreateSettlement(session, {
                              fromMemberId: s.fromMemberId,
                              toMemberId: s.toMemberId,
                              amountBase: s.amountBase,
                              clientMutationId: crypto.randomUUID(),
                            });
                            await refresh(session);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Ошибка");
                          }
                        });
                      }}
                    >
                      Отметить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {snapshot && snapshot.settlements.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              История погашений
            </h2>
            <ul className="space-y-2">
              {[...snapshot.settlements]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-sm border-b border-emerald-900/5 py-1.5"
                  >
                    <div>
                      <div>
                        {memberName(snapshot, s.fromMemberId)} → {memberName(snapshot, s.toMemberId)}:{" "}
                        <strong>
                          {s.amountBase} {snapshot.room.baseCurrency}
                        </strong>
                      </div>
                      <div className="text-xs text-emerald-950/45">
                        {s.status === "confirmed" ? (
                          <span className="text-teal-800">Подтверждено получателем</span>
                        ) : (
                          <span className="text-amber-800">
                            Ожидает подтверждения от {memberName(snapshot, s.toMemberId)}
                          </span>
                        )}
                      </div>
                    </div>
                    {s.status === "pending" && s.toMemberId === session.memberId && (
                      <button
                        type="button"
                        disabled={pending}
                        className="shrink-0 rounded-lg bg-teal-800 text-white px-2.5 py-1.5 text-xs"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            try {
                              await apiConfirmSettlement(session, s.id);
                              await refresh(session);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Ошибка");
                            }
                          });
                        }}
                      >
                        Подтвердить получение
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {snapshot?.room.status === "open" && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Добавить расход
            </h2>
            <input
              placeholder="Описание"
              className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Сумма"
                inputMode="decimal"
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.labelRu}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
                value={splitMethod}
                onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
              >
                <option value="equal">Поровну</option>
                <option value="fixed">Фикс. суммы</option>
                <option value="percentage">Проценты</option>
                <option value="shares">Доли</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-emerald-950/70">
              <input
                type="checkbox"
                checked={excludePayer}
                onChange={(e) => setExcludePayer(e.target.checked)}
              />
              Исключая плательщика
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-emerald-950/60">Кто заплатил</span>
              <select
                className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm"
                value={paidByMemberId || session.memberId}
                onChange={(e) => setPaidByMemberId(e.target.value)}
              >
                {snapshot.members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName}
                    {m.status === "local" ? " (лок.)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {snapshot.members.map((m) => {
                const on = selectedIds.includes(m.memberId);
                return (
                  <button
                    key={m.memberId}
                    type="button"
                    onClick={() =>
                      setSelectedIds((prev) =>
                        on ? prev.filter((id) => id !== m.memberId) : [...prev, m.memberId],
                      )
                    }
                    className={`rounded-lg px-2.5 py-1 text-xs border ${
                      on
                        ? "bg-teal-800 text-white border-teal-800"
                        : "bg-white text-emerald-950/70 border-emerald-900/15"
                    }`}
                  >
                    {m.displayName}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={pending || !amount}
              className="w-full rounded-xl bg-teal-800 text-white py-3 text-sm font-medium disabled:opacity-60"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await apiCreateExpense(session, {
                      description: description || "Расход",
                      amountOriginal: Number(amount).toFixed(2),
                      currencyOriginal: currency,
                      categoryId,
                      paidByMemberId: paidByMemberId || session.memberId,
                      splitMethod,
                      participants: participantInputs,
                      clientMutationId: crypto.randomUUID(),
                    });
                    setDescription("");
                    setAmount("");
                    await refresh(session);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Ошибка");
                  }
                });
              }}
            >
              Сохранить расход
            </button>
          </section>
        )}

        {snapshot && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Расходы
            </h2>
            {snapshot.expenses.length === 0 && (
              <p className="text-sm text-emerald-950/45">Пока пусто</p>
            )}
            <ul className="space-y-2">
              {snapshot.expenses.map((e) => (
                <li key={e.id} className="text-sm border-b border-emerald-900/5 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{e.description}</div>
                      <div className="text-xs text-emerald-950/50">
                        {e.amountOriginal} {e.currencyOriginal} → {e.amountBase}{" "}
                        {snapshot.room.baseCurrency} · {e.splitMethod}
                        {e.locked ? " · lock" : ""}
                      </div>
                    </div>
                    {!e.locked && snapshot.room.status === "open" && (
                      <button
                        type="button"
                        className="text-xs text-rose-700"
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              await apiDeleteExpense(session, e.id);
                              await refresh(session);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Ошибка");
                            }
                          });
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {snapshot && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
                Расширенный учёт
              </h2>
              <label className="flex items-center gap-2 text-sm text-emerald-950/70 shrink-0">
                <span className="text-xs">{showAdvanced ? "Вкл" : "Выкл"}</span>
                <input
                  type="checkbox"
                  checked={showAdvanced}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setShowAdvanced(on);
                    if (on && session) {
                      setError(null);
                      startTransition(async () => {
                        try {
                          await refresh(session, { withLedger: true });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Ошибка загрузки");
                        }
                      });
                    }
                  }}
                />
              </label>
            </div>
            {!showAdvanced && (
              <p className="text-xs text-emerald-950/50">
                Касса, взносы и расходы из общего фонда. Включается автоматически при первом
                активе или взносе.
              </p>
            )}
            {showAdvanced && ledger && (
              <SplitAdvancedPanel
                session={session}
                snapshot={snapshot}
                ledger={ledger}
                pending={pending}
                onRefresh={() => refresh(session, { withLedger: true })}
                onError={setError}
                startAction={(fn) => {
                  setError(null);
                  startTransition(fn);
                }}
              />
            )}
            {showAdvanced && !ledger && (
              <p className="text-sm text-emerald-950/45">Загрузка журнала…</p>
            )}
          </section>
        )}

        {snapshot && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
                Отчёты
              </h2>
              <label className="flex items-center gap-2 text-sm text-emerald-950/70 shrink-0">
                <span className="text-xs">{showReport ? "Вкл" : "Выкл"}</span>
                <input
                  type="checkbox"
                  checked={showReport}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setShowReport(on);
                    if (on && session) {
                      setError(null);
                      startTransition(async () => {
                        try {
                          setReport(await apiGetReport(session));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Ошибка загрузки");
                        }
                      });
                    }
                  }}
                />
              </label>
            </div>
            {!showReport && (
              <p className="text-xs text-emerald-950/50">
                Общие траты по категориям, кто сколько внёс и кто сколько должен — сводно и по
                каждому участнику.
              </p>
            )}
            {showReport && report && <SplitReportPanel snapshot={snapshot} report={report} />}
            {showReport && !report && (
              <p className="text-sm text-emerald-950/45">Загрузка отчёта…</p>
            )}
          </section>
        )}

        {canEditAsOwner && snapshot?.room.status === "open" && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Курсы (владелец)
            </h2>
            <p className="text-xs text-emerald-950/50">
              Курс = сколько {snapshot.room.baseCurrency} за 1 единицу валюты. Влияет только на
              новые расходы.
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-2 py-2 text-sm"
                value={fxCurrency}
                onChange={(e) => setFxCurrency(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.filter((c) => c !== snapshot.room.baseCurrency).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                placeholder="Курс"
                inputMode="decimal"
                className="rounded-xl border border-emerald-900/15 bg-white px-2 py-2 text-sm"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl bg-emerald-900 text-white px-3 text-xs"
                onClick={() => {
                  startTransition(async () => {
                    try {
                      const existing = snapshot.room.rates.filter((r) => r.currency !== fxCurrency);
                      await apiSetRates(session, [
                        ...existing.map((r) => ({ currency: r.currency, rate: r.rate })),
                        { currency: fxCurrency, rate: Number(fxRate).toFixed(4) },
                      ]);
                      setFxRate("");
                      await refresh(session);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Ошибка");
                    }
                  });
                }}
              >
                OK
              </button>
            </div>
            <ul className="text-xs text-emerald-950/60 space-y-1">
              {snapshot.room.rates.map((r) => (
                <li key={r.currency}>
                  1 {r.currency} = {r.rate} {snapshot.room.baseCurrency}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
            Комната
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs"
              onClick={() => {
                startTransition(async () => {
                  try {
                    const invite = await apiCreateInvite(session, "link");
                    const url = `${window.location.origin}${invite.joinPath}`;
                    setInviteUrl(url);
                    // iOS: clipboard after await loses user-gesture → NotAllowedError.
                    // Never surface that as a room error; link is shown below for manual copy.
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url);
                      }
                    } catch {
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: "QHub Split", url, text: url });
                        }
                      } catch {
                        // User dismissed share or unavailable — URL still visible.
                      }
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Ошибка");
                  }
                });
              }}
            >
              Пригласить (ссылка)
            </button>
            <button
              type="button"
              className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs"
              onClick={() => {
                startTransition(async () => {
                  try {
                    const csv = await apiExportCsv(session);
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `split-${session.roomId}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Ошибка");
                  }
                });
              }}
            >
              Экспорт CSV
            </button>
            {canEditAsOwner && snapshot?.room.status === "open" && (
              <button
                type="button"
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs"
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await apiArchiveRoom(session);
                      await refresh(session);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Ошибка");
                    }
                  });
                }}
              >
                В архив
              </button>
            )}
          </div>
          {inviteUrl && (
            <p className="text-xs break-all text-teal-800 bg-teal-50 rounded-lg p-2">{inviteUrl}</p>
          )}
        </section>
      </div>
    </SplitShell>
  );
}
