import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { DEFAULT_CATEGORIES } from "@/lib/split/constants";
import { listExpenses } from "@/lib/split/store";
import { d, money } from "@/lib/split/decimal";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const expenses = await listExpenses(roomId);
    const byCategory = new Map<string, ReturnType<typeof d>>();
    const byPayer = new Map<string, ReturnType<typeof d>>();
    for (const e of expenses) {
      byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? d(0)).plus(d(e.amountBase)));
      byPayer.set(e.paidByMemberId, (byPayer.get(e.paidByMemberId) ?? d(0)).plus(d(e.amountBase)));
    }
    return withCors(
      Response.json({
        byCategory: [...byCategory.entries()].map(([categoryId, amount]) => ({
          categoryId,
          labelRu: DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.labelRu ?? categoryId,
          amountBase: money(amount),
        })),
        byPayer: [...byPayer.entries()].map(([memberId, amount]) => ({
          memberId,
          amountBase: money(amount),
        })),
        totalBase: money(expenses.reduce((acc, e) => acc.plus(d(e.amountBase)), d(0))),
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
