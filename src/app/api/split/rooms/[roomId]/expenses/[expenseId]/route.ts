import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { deleteExpense, updateExpense } from "@/lib/split/store";
import type { ExpenseParticipantInput, Money, SplitMethod } from "@/lib/split/types";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ roomId: string; expenseId: string }> },
) {
  try {
    const { roomId, expenseId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as {
      description?: string;
      amountOriginal?: Money;
      currencyOriginal?: string;
      categoryId?: string;
      paidByMemberId?: string;
      splitMethod?: SplitMethod;
      participants?: ExpenseParticipantInput[];
      comment?: string | null;
      personal?: boolean;
    };
    const expense = await updateExpense({
      roomId,
      expenseId,
      actorMemberId: member.memberId,
      ...body,
    });
    return withCors(Response.json(expense), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ roomId: string; expenseId: string }> },
) {
  try {
    const { roomId, expenseId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    await deleteExpense(roomId, expenseId);
    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
