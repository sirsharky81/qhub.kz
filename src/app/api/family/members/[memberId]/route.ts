import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { removeMember } from "@/lib/family/store";

interface RouteContext {
  params: Promise<{ memberId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const actor = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`remove:${actor.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    await removeMember(actor.memberId, memberId);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
