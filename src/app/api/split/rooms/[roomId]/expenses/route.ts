import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { createExpense, listExpenses } from "@/lib/split/store";
import type { ExpenseParticipantInput, Money, SplitMethod } from "@/lib/split/types";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const expenses = await listExpenses(roomId);
    return withCors(Response.json({ expenses }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as {
      description?: string;
      amountOriginal?: Money;
      currencyOriginal?: string;
      categoryId?: string;
      paidByMemberId?: string;
      splitMethod?: SplitMethod;
      participants?: ExpenseParticipantInput[];
      comment?: string;
      clientMutationId?: string;
    };
    if (!body.amountOriginal || !body.currencyOriginal || !body.splitMethod || !body.participants?.length) {
      return withCors(Response.json({ error: "Неполные данные расхода" }, { status: 400 }), request);
    }
    const expense = await createExpense({
      roomId,
      actorMemberId: member.memberId,
      description: body.description || "Расход",
      amountOriginal: body.amountOriginal,
      currencyOriginal: body.currencyOriginal,
      categoryId: body.categoryId,
      paidByMemberId: body.paidByMemberId || member.memberId,
      splitMethod: body.splitMethod,
      participants: body.participants,
      comment: body.comment,
      clientMutationId: body.clientMutationId,
    });
    return withCors(Response.json(expense), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
