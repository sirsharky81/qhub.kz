import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { clearSos, getMember } from "@/lib/family/store";

interface RouteContext {
  params: Promise<{ memberId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const actor = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`sos-clear:${actor.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const target = await getMember(memberId);
    if (!target || target.roomId !== actor.roomId) {
      return Response.json({ error: "Участник не найден" }, { status: 404 });
    }
    if (actor.role === "tracked" && actor.memberId !== memberId) {
      return Response.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    await clearSos(memberId);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
