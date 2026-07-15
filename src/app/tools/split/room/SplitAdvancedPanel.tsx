"use client";

import { useMemo, useState } from "react";
import {
  apiCreateAsset,
  apiCreateOperation,
} from "@/lib/split/client";
import { DEFAULT_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/split/constants";
import type { SplitOperation } from "@/lib/split/ledger";
import type { SplitLedgerResponse, SplitMethod, SplitRoomSnapshot, SplitSession } from "@/lib/split/types";

interface Props {
  session: SplitSession;
  snapshot: SplitRoomSnapshot;
  ledger: SplitLedgerResponse;
  pending: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  startAction: (fn: () => Promise<void>) => void;
}

function memberName(snapshot: SplitRoomSnapshot, id: string): string {
  return snapshot.members.find((m) => m.memberId === id)?.displayName ?? id.slice(0, 6);
}

function assetLabel(ledger: SplitLedgerResponse, assetId: string): string {
  const a = ledger.ledger.assets.find((x) => x.assetId === assetId);
  return a?.name ?? assetId.slice(0, 6);
}

function formatOpSummary(
  op: SplitOperation,
  snapshot: SplitRoomSnapshot,
  ledger: SplitLedgerResponse,
): string {
  const m = (id: string) => memberName(snapshot, id);
  const a = (id: string) => assetLabel(ledger, id);
  switch (op.type) {
    case "expense": {
      const src =
        op.paymentSource.kind === "asset"
          ? `из ${a(op.paymentSource.assetId)}`
          : `от ${m(op.paymentSource.memberId)}`;
      return `${op.description}: ${op.amountOriginal} ${op.currencyOriginal} (${src})`;
    }
    case "contribution":
      return `${m(op.fromMemberId)} → ${a(op.toAssetId)}: ${op.amount} ${op.currency}`;
    case "settlement":
      return `${m(op.fromMemberId)} → ${m(op.toMemberId)}: ${op.amountBase}`;
    case "transfer":
      return `${a(op.fromAssetId)} → ${a(op.toAssetId)}: ${op.amount} ${op.currency}`;
    case "withdrawal":
      return `${a(op.fromAssetId)} → ${m(op.toMemberId)}: ${op.amount} ${op.currency}`;
    case "exchange":
      return `${a(op.fromAssetId)} ${op.fromAmount} → ${a(op.toAssetId)} ${op.toAmount}`;
    case "custody_handoff":
      return `${a(op.assetId)} → ${m(op.toCustodianMemberId)}`;
    case "adjustment":
      return op.reason;
    default:
      return op.type;
  }
}

const OP_TYPE_LABEL: Record<SplitOperation["type"], string> = {
  expense: "Расход",
  contribution: "Взнос",
  settlement: "Погашение",
  transfer: "Перевод",
  withdrawal: "Изъятие",
  exchange: "Обмен",
  custody_handoff: "Передача",
  adjustment: "Корректировка",
};

function buildParticipantInputs(
  snapshot: SplitRoomSnapshot,
  splitMethod: SplitMethod,
  amount: string,
  selectedIds: string[],
): Array<{ memberId: string; inputValue?: string }> {
  let ids = selectedIds.length > 0 ? selectedIds : snapshot.members.map((m) => m.memberId);
  if (splitMethod === "equal") {
    return ids.map((memberId) => ({ memberId }));
  }
  if (splitMethod === "percentage") {
    const each = (100 / Math.max(ids.length, 1)).toFixed(2);
    return ids.map((memberId, i) => ({
      memberId,
      inputValue:
        i === ids.length - 1
          ? (100 - Number(each) * (ids.length - 1)).toFixed(2)
          : each,
    }));
  }
  if (splitMethod === "shares") {
    return ids.map((memberId) => ({ memberId, inputValue: "1" }));
  }
  const n = Math.max(ids.length, 1);
  const each = amount ? (Number(amount) / n).toFixed(2) : "0.00";
  return ids.map((memberId, i) => ({
    memberId,
    inputValue:
      i === n - 1 && amount ? (Number(amount) - Number(each) * (n - 1)).toFixed(2) : each,
  }));
}

export function SplitAdvancedPanel({
  session,
  snapshot,
  ledger,
  pending,
  onRefresh,
  onError,
  startAction,
}: Props) {
  const baseCurrency = snapshot.room.baseCurrency;
  const assets = ledger.ledger.assets;
  const isOpen = snapshot.room.status === "open";

  const [assetName, setAssetName] = useState("Касса");
  const [assetCurrency, setAssetCurrency] = useState(baseCurrency);
  const [assetCustodian, setAssetCustodian] = useState(session.memberId);

  const [contribAssetId, setContribAssetId] = useState("");
  const [contribAmount, setContribAmount] = useState("");
  const [contribFrom, setContribFrom] = useState(session.memberId);

  const [expAssetId, setExpAssetId] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState(baseCurrency);
  const [expCategory, setExpCategory] = useState("food");
  const [expSplitMethod, setExpSplitMethod] = useState<SplitMethod>("equal");
  const [expSelectedIds, setExpSelectedIds] = useState<string[]>(() =>
    snapshot.members.map((m) => m.memberId),
  );

  const effectiveContribAsset = contribAssetId || assets[0]?.assetId || "";
  const effectiveExpAsset = expAssetId || assets[0]?.assetId || "";
  const expAsset = assets.find((a) => a.assetId === effectiveExpAsset);

  const sortedOps = useMemo(
    () => [...ledger.operations].sort((a, b) => b.createdAt - a.createdAt),
    [ledger.operations],
  );

  return (
    <div className="space-y-6 border-t border-emerald-900/10 pt-6">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
          Активы комнаты
        </h2>
        {assets.length === 0 ? (
          <p className="text-sm text-emerald-950/45">Нет активов — создайте кассу ниже</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Всего: {ledger.ledger.sumAssetBalancesBase} {baseCurrency}
            </p>
            <ul className="space-y-1.5">
              {assets.map((a) => (
                <li
                  key={a.assetId}
                  className="flex items-center justify-between text-sm py-1 border-b border-emerald-900/5"
                >
                  <span className="text-emerald-950/80">
                    у {memberName(snapshot, a.custodianMemberId)} ({a.name})
                  </span>
                  <span className="font-medium tabular-nums">
                    {a.balanceNative} {a.currency}
                    {a.currency !== baseCurrency && (
                      <span className="text-xs text-emerald-950/45 ml-1">
                        ≈ {a.balanceBase} {baseCurrency}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {isOpen && (
        <>
          <section className="space-y-3 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
              Новый актив
            </h3>
            <input
              placeholder="Название"
              className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                value={assetCurrency}
                onChange={(e) => setAssetCurrency(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                value={assetCustodian}
                onChange={(e) => setAssetCustodian(e.target.value)}
              >
                {snapshot.members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={pending}
              className="w-full rounded-xl bg-emerald-900 text-white py-2.5 text-sm disabled:opacity-60"
              onClick={() => {
                onError(null);
                startAction(async () => {
                  try {
                    await apiCreateAsset(session, {
                      name: assetName.trim() || "Касса",
                      currency: assetCurrency,
                      custodianMemberId: assetCustodian,
                      kind: "cash",
                    });
                    await onRefresh();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Ошибка");
                  }
                });
              }}
            >
              Создать актив
            </button>
          </section>

          {assets.length > 0 && (
            <>
              <section className="space-y-3 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
                  Взнос в кассу
                </h3>
                <select
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                  value={effectiveContribAsset}
                  onChange={(e) => setContribAssetId(e.target.value)}
                >
                  {assets.map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Сумма"
                    inputMode="decimal"
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={contribAmount}
                    onChange={(e) => setContribAmount(e.target.value)}
                  />
                  <select
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={contribFrom}
                    onChange={(e) => setContribFrom(e.target.value)}
                  >
                    {snapshot.members.map((m) => (
                      <option key={m.memberId} value={m.memberId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={pending || !contribAmount}
                  className="w-full rounded-xl bg-teal-800 text-white py-2.5 text-sm disabled:opacity-60"
                  onClick={() => {
                    onError(null);
                    startAction(async () => {
                      try {
                        const asset = assets.find((a) => a.assetId === effectiveContribAsset);
                        await apiCreateOperation(session, {
                          type: "contribution",
                          toAssetId: effectiveContribAsset,
                          amount: Number(contribAmount).toFixed(2),
                          currency: asset?.currency,
                          fromMemberId: contribFrom,
                          clientMutationId: crypto.randomUUID(),
                        });
                        setContribAmount("");
                        await onRefresh();
                      } catch (err) {
                        onError(err instanceof Error ? err.message : "Ошибка");
                      }
                    });
                  }}
                >
                  Записать взнос
                </button>
              </section>

              <section className="space-y-3 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
                  Расход из кассы
                </h3>
                <input
                  placeholder="Описание"
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                />
                <select
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                  value={effectiveExpAsset}
                  onChange={(e) => {
                    setExpAssetId(e.target.value);
                    const a = assets.find((x) => x.assetId === e.target.value);
                    if (a) setExpCurrency(a.currency);
                  }}
                >
                  {assets.map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.name} — {a.balanceNative} {a.currency}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Сумма"
                    inputMode="decimal"
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                  />
                  <select
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
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
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                  >
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.labelRu}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                    value={expSplitMethod}
                    onChange={(e) => setExpSplitMethod(e.target.value as SplitMethod)}
                  >
                    <option value="equal">Поровну</option>
                    <option value="fixed">Фикс. суммы</option>
                    <option value="percentage">Проценты</option>
                    <option value="shares">Доли</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {snapshot.members.map((m) => {
                    const on = expSelectedIds.includes(m.memberId);
                    return (
                      <button
                        key={m.memberId}
                        type="button"
                        onClick={() =>
                          setExpSelectedIds((prev) =>
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
                {expAsset && Number(expAmount) > Number(expAsset.balanceNative) && (
                  <p className="text-xs text-amber-800">
                    Сумма больше остатка ({expAsset.balanceNative} {expAsset.currency})
                  </p>
                )}
                <button
                  type="button"
                  disabled={pending || !expAmount || !effectiveExpAsset}
                  className="w-full rounded-xl bg-teal-800 text-white py-2.5 text-sm disabled:opacity-60"
                  onClick={() => {
                    onError(null);
                    startAction(async () => {
                      try {
                        await apiCreateOperation(session, {
                          type: "expense_from_asset",
                          assetId: effectiveExpAsset,
                          description: expDescription || "Расход",
                          amountOriginal: Number(expAmount).toFixed(2),
                          currencyOriginal: expCurrency,
                          categoryId: expCategory,
                          splitMethod: expSplitMethod,
                          participants: buildParticipantInputs(
                            snapshot,
                            expSplitMethod,
                            expAmount,
                            expSelectedIds,
                          ),
                          clientMutationId: crypto.randomUUID(),
                        });
                        setExpDescription("");
                        setExpAmount("");
                        await onRefresh();
                      } catch (err) {
                        onError(err instanceof Error ? err.message : "Ошибка");
                      }
                    });
                  }}
                >
                  Списать из кассы
                </button>
              </section>
            </>
          )}
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
          Журнал операций
        </h2>
        {sortedOps.length === 0 && (
          <p className="text-sm text-emerald-950/45">Пока пусто</p>
        )}
        <ul className="space-y-2">
          {sortedOps.map((op) => (
            <li key={op.id} className="text-sm border-b border-emerald-900/5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-emerald-900/40 mr-1.5">
                    {OP_TYPE_LABEL[op.type]}
                  </span>
                  <span className="font-medium">{formatOpSummary(op, snapshot, ledger)}</span>
                  <div className="text-xs text-emerald-950/45 mt-0.5">
                    {new Date(op.createdAt).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
