import { d, eqMoney, money, zeroMoney } from "../decimal";
import type { Decimal } from "../decimal";
import { SplitValidationError } from "../engine/shares";
import type { Money } from "../types";
import type {
  AssetBalance,
  LedgerMemberBalance,
  LedgerSnapshot,
  RoomAsset,
  SplitOperation,
} from "./types";

export interface FxRateTable {
  /** Units of base currency per 1 unit of `currency`. Base currency maps to 1. */
  rateToBase(currency: string): Money;
}

export interface FoldLedgerInput {
  memberIds: readonly string[];
  assets: readonly RoomAsset[];
  operations: readonly SplitOperation[];
  fx: FxRateTable;
  baseCurrency: string;
}

function ensureMember(
  paid: Map<string, Decimal>,
  share: Map<string, Decimal>,
  memberId: string,
): void {
  if (!paid.has(memberId)) {
    paid.set(memberId, d(0));
    share.set(memberId, d(0));
  }
}

function ensureAsset(balances: Map<string, Decimal>, assetId: string): void {
  if (!balances.has(assetId)) balances.set(assetId, d(0));
}

function toBase(amountNative: Money, currency: string, fx: FxRateTable, baseCurrency: string): Money {
  if (currency.toUpperCase() === baseCurrency.toUpperCase()) return money(amountNative);
  return money(d(amountNative).mul(d(fx.rateToBase(currency))));
}

function assertNonNegativeAsset(balances: Map<string, Decimal>, assetId: string): void {
  const bal = balances.get(assetId) ?? d(0);
  if (bal.lt(0)) throw new SplitValidationError("asset_negative_balance");
}

/**
 * Model A ledger fold:
 * - Member nets from ops (paid − share)
 * - Asset native balances from ops
 * - Invariant after fold: Σ member nets (base) == Σ assets (base)
 * - Negative asset balances forbidden
 */
export function foldLedger(input: FoldLedgerInput): LedgerSnapshot {
  const { memberIds, assets, operations, fx, baseCurrency } = input;
  const assetById = new Map(assets.map((a) => [a.id, { ...a }]));
  const paid = new Map<string, Decimal>();
  const share = new Map<string, Decimal>();
  const assetBal = new Map<string, Decimal>();

  for (const id of memberIds) ensureMember(paid, share, id);
  for (const a of assets) {
    ensureAsset(assetBal, a.id);
  }

  let sawAdvanced = false;

  for (const op of operations) {
    switch (op.type) {
      case "expense": {
        const amount = d(op.amountBase);
        if (op.paymentSource.kind === "member") {
          ensureMember(paid, share, op.paymentSource.memberId);
          paid.set(
            op.paymentSource.memberId,
            paid.get(op.paymentSource.memberId)!.plus(amount),
          );
        } else {
          const assetId = op.paymentSource.assetId;
          if (!assetById.has(assetId)) throw new SplitValidationError("asset_not_found");
          ensureAsset(assetBal, assetId);
          // Debit asset in native currency of the asset (expense amountOriginal if same currency,
          // otherwise we require amountBase conversion already and debit native via rate).
          const asset = assetById.get(assetId)!;
          const debitNative =
            op.currencyOriginal.toUpperCase() === asset.currency.toUpperCase()
              ? d(op.amountOriginal)
              : d(op.amountBase).div(d(fx.rateToBase(asset.currency)));
          assetBal.set(assetId, assetBal.get(assetId)!.minus(debitNative));
          assertNonNegativeAsset(assetBal, assetId);
          sawAdvanced = true;
        }
        for (const p of op.participants) {
          ensureMember(paid, share, p.memberId);
          share.set(p.memberId, share.get(p.memberId)!.plus(d(p.amountBase)));
        }
        break;
      }
      case "contribution": {
        sawAdvanced = true;
        ensureMember(paid, share, op.fromMemberId);
        if (!assetById.has(op.toAssetId)) throw new SplitValidationError("asset_not_found");
        ensureAsset(assetBal, op.toAssetId);
        paid.set(op.fromMemberId, paid.get(op.fromMemberId)!.plus(d(op.amountBase)));
        const asset = assetById.get(op.toAssetId)!;
        const creditNative =
          op.currency.toUpperCase() === asset.currency.toUpperCase()
            ? d(op.amount)
            : d(op.amountBase).div(d(fx.rateToBase(asset.currency)));
        assetBal.set(op.toAssetId, assetBal.get(op.toAssetId)!.plus(creditNative));
        break;
      }
      case "settlement": {
        ensureMember(paid, share, op.fromMemberId);
        ensureMember(paid, share, op.toMemberId);
        paid.set(op.fromMemberId, paid.get(op.fromMemberId)!.plus(d(op.amountBase)));
        share.set(op.toMemberId, share.get(op.toMemberId)!.plus(d(op.amountBase)));
        break;
      }
      case "transfer": {
        sawAdvanced = true;
        if (!assetById.has(op.fromAssetId) || !assetById.has(op.toAssetId)) {
          throw new SplitValidationError("asset_not_found");
        }
        const from = assetById.get(op.fromAssetId)!;
        const to = assetById.get(op.toAssetId)!;
        if (from.currency.toUpperCase() !== to.currency.toUpperCase()) {
          throw new SplitValidationError("transfer_currency_mismatch");
        }
        if (op.currency.toUpperCase() !== from.currency.toUpperCase()) {
          throw new SplitValidationError("transfer_currency_mismatch");
        }
        ensureAsset(assetBal, op.fromAssetId);
        ensureAsset(assetBal, op.toAssetId);
        assetBal.set(op.fromAssetId, assetBal.get(op.fromAssetId)!.minus(d(op.amount)));
        assertNonNegativeAsset(assetBal, op.fromAssetId);
        assetBal.set(op.toAssetId, assetBal.get(op.toAssetId)!.plus(d(op.amount)));
        break;
      }
      case "withdrawal": {
        sawAdvanced = true;
        if (!assetById.has(op.fromAssetId)) throw new SplitValidationError("asset_not_found");
        ensureAsset(assetBal, op.fromAssetId);
        ensureMember(paid, share, op.toMemberId);
        const asset = assetById.get(op.fromAssetId)!;
        const debitNative =
          op.currency.toUpperCase() === asset.currency.toUpperCase()
            ? d(op.amount)
            : d(op.amountBase).div(d(fx.rateToBase(asset.currency)));
        assetBal.set(op.fromAssetId, assetBal.get(op.fromAssetId)!.minus(debitNative));
        assertNonNegativeAsset(assetBal, op.fromAssetId);
        share.set(op.toMemberId, share.get(op.toMemberId)!.plus(d(op.amountBase)));
        break;
      }
      case "exchange": {
        sawAdvanced = true;
        if (!assetById.has(op.fromAssetId) || !assetById.has(op.toAssetId)) {
          throw new SplitValidationError("asset_not_found");
        }
        ensureAsset(assetBal, op.fromAssetId);
        ensureAsset(assetBal, op.toAssetId);
        assetBal.set(op.fromAssetId, assetBal.get(op.fromAssetId)!.minus(d(op.fromAmount)));
        assertNonNegativeAsset(assetBal, op.fromAssetId);
        assetBal.set(op.toAssetId, assetBal.get(op.toAssetId)!.plus(d(op.toAmount)));
        break;
      }
      case "custody_handoff": {
        sawAdvanced = true;
        const asset = assetById.get(op.assetId);
        if (!asset) throw new SplitValidationError("asset_not_found");
        asset.custodianMemberId = op.toCustodianMemberId;
        break;
      }
      case "adjustment": {
        sawAdvanced = true;
        for (const delta of op.memberDeltas) {
          ensureMember(paid, share, delta.memberId);
          const v = d(delta.deltaBase);
          if (v.gte(0)) paid.set(delta.memberId, paid.get(delta.memberId)!.plus(v));
          else share.set(delta.memberId, share.get(delta.memberId)!.plus(v.abs()));
        }
        for (const delta of op.assetDeltas) {
          ensureAsset(assetBal, delta.assetId);
          assetBal.set(delta.assetId, assetBal.get(delta.assetId)!.plus(d(delta.deltaNative)));
          assertNonNegativeAsset(assetBal, delta.assetId);
        }
        break;
      }
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
        throw new SplitValidationError("invalid_operation_type");
      }
    }
  }

  const memberIdsOut = new Set([...memberIds, ...paid.keys()]);
  const members: LedgerMemberBalance[] = [];
  for (const memberId of memberIdsOut) {
    const paidBase = money(paid.get(memberId) ?? 0);
    const shareBase = money(share.get(memberId) ?? 0);
    members.push({
      memberId,
      paidBase,
      shareBase,
      netBase: money(d(paidBase).minus(d(shareBase))),
    });
  }

  const assetBalances: AssetBalance[] = [];
  for (const asset of assetById.values()) {
    const balanceNative = money(assetBal.get(asset.id) ?? 0);
    assetBalances.push({
      assetId: asset.id,
      currency: asset.currency,
      custodianMemberId: asset.custodianMemberId,
      name: asset.name,
      kind: asset.kind,
      balanceNative,
      balanceBase: toBase(balanceNative, asset.currency, fx, baseCurrency),
    });
  }

  const sumMemberNetsBase = money(
    members.reduce((acc, m) => acc.plus(d(m.netBase)), d(0)),
  );
  const sumAssetBalancesBase = money(
    assetBalances.reduce((acc, a) => acc.plus(d(a.balanceBase)), d(0)),
  );

  if (!eqMoney(sumMemberNetsBase, sumAssetBalancesBase)) {
    throw new SplitValidationError("ledger_invariant_broken");
  }

  return {
    members,
    assets: assetBalances,
    sumMemberNetsBase,
    sumAssetBalancesBase,
    advancedSuggested: sawAdvanced || assetBalances.some((a) => d(a.balanceNative).gt(0)),
  };
}

export function identityFx(baseCurrency: string): FxRateTable {
  const base = baseCurrency.toUpperCase();
  return {
    rateToBase(currency: string) {
      if (currency.toUpperCase() === base) return money(1);
      throw new SplitValidationError("missing_exchange_rate");
    },
  };
}

export function ratesFx(
  baseCurrency: string,
  rates: ReadonlyArray<{ currency: string; rate: Money }>,
): FxRateTable {
  const base = baseCurrency.toUpperCase();
  const map = new Map(rates.map((r) => [r.currency.toUpperCase(), money(r.rate)]));
  return {
    rateToBase(currency: string) {
      const c = currency.toUpperCase();
      if (c === base) return money(1);
      const rate = map.get(c);
      if (!rate) throw new SplitValidationError("missing_exchange_rate");
      return rate;
    },
  };
}

export function assertLedgerSettledAmongMembers(snapshot: LedgerSnapshot): boolean {
  // With zero assets, all nets must be zero. With assets, nets sum to assets —
  // "settled among members" means no pairwise debt beyond asset claims: all nets >= 0
  // relative to assets ownership is complex; for MVP without open debts between people,
  // suggestions use only the personal-expense subgraph. Here: true when every net equals
  // sum of assets held as custodian converted… too heavy. Simple: all assets zero and nets zero.
  if (snapshot.assets.every((a) => eqMoney(a.balanceNative, zeroMoney()))) {
    return snapshot.members.every((m) => eqMoney(m.netBase, zeroMoney()));
  }
  return false;
}
