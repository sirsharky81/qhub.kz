import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import {
  createContribution,
  createCustodyHandoff,
  createExchange,
  createExpenseFromAsset,
  createTransfer,
  createWithdrawal,
  listOperations,
} from "@/lib/split/ledger-store";
import type { ExpenseParticipantInput, Money, SplitMethod } from "@/lib/split/types";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const operations = await listOperations(roomId);
    return withCors(Response.json({ operations }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as {
      type?: string;
      clientMutationId?: string;
      comment?: string;
      // contribution
      fromMemberId?: string;
      toAssetId?: string;
      amount?: Money;
      currency?: string;
      // expense from asset
      description?: string;
      amountOriginal?: Money;
      currencyOriginal?: string;
      categoryId?: string;
      assetId?: string;
      splitMethod?: SplitMethod;
      participants?: ExpenseParticipantInput[];
      // withdrawal
      toMemberId?: string;
      fromAssetId?: string;
      // transfer
      // exchange
      fromAmount?: Money;
      toAmount?: Money;
      // custody
      toCustodianMemberId?: string;
    };

    switch (body.type) {
      case "contribution": {
        if (!body.toAssetId || !body.amount) {
          return withCors(Response.json({ error: "Неполные данные взноса" }, { status: 400 }), request);
        }
        const op = await createContribution({
          roomId,
          actorMemberId: member.memberId,
          fromMemberId: body.fromMemberId || member.memberId,
          toAssetId: body.toAssetId,
          amount: body.amount,
          currency: body.currency,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      case "expense_from_asset": {
        if (!body.assetId || !body.amountOriginal || !body.currencyOriginal || !body.splitMethod || !body.participants?.length) {
          return withCors(Response.json({ error: "Неполные данные расхода" }, { status: 400 }), request);
        }
        const op = await createExpenseFromAsset({
          roomId,
          actorMemberId: member.memberId,
          description: body.description || "Расход",
          amountOriginal: body.amountOriginal,
          currencyOriginal: body.currencyOriginal,
          categoryId: body.categoryId,
          assetId: body.assetId,
          splitMethod: body.splitMethod,
          participants: body.participants,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      case "withdrawal": {
        if (!body.fromAssetId || !body.amount || !body.toMemberId) {
          return withCors(Response.json({ error: "Неполные данные изъятия" }, { status: 400 }), request);
        }
        const op = await createWithdrawal({
          roomId,
          actorMemberId: member.memberId,
          fromAssetId: body.fromAssetId,
          toMemberId: body.toMemberId,
          amount: body.amount,
          currency: body.currency,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      case "transfer": {
        if (!body.fromAssetId || !body.toAssetId || !body.amount) {
          return withCors(Response.json({ error: "Неполные данные перевода" }, { status: 400 }), request);
        }
        const op = await createTransfer({
          roomId,
          actorMemberId: member.memberId,
          fromAssetId: body.fromAssetId,
          toAssetId: body.toAssetId,
          amount: body.amount,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      case "exchange": {
        if (!body.fromAssetId || !body.toAssetId || !body.fromAmount || !body.toAmount) {
          return withCors(Response.json({ error: "Неполные данные обмена" }, { status: 400 }), request);
        }
        const op = await createExchange({
          roomId,
          actorMemberId: member.memberId,
          fromAssetId: body.fromAssetId,
          fromAmount: body.fromAmount,
          toAssetId: body.toAssetId,
          toAmount: body.toAmount,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      case "custody_handoff": {
        if (!body.assetId || !body.toCustodianMemberId) {
          return withCors(Response.json({ error: "Неполные данные передачи" }, { status: 400 }), request);
        }
        const op = await createCustodyHandoff({
          roomId,
          actorMemberId: member.memberId,
          assetId: body.assetId,
          toCustodianMemberId: body.toCustodianMemberId,
          comment: body.comment,
          clientMutationId: body.clientMutationId,
        });
        return withCors(Response.json(op), request);
      }
      default:
        return withCors(Response.json({ error: "Неизвестный тип операции" }, { status: 400 }), request);
    }
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
