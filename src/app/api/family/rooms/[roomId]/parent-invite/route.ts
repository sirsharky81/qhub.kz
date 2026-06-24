import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertOwner, jsonFamilyAuthError } from "@/lib/family/guard";
import { countRoomObservers, createBindToken } from "@/lib/family/store";

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const owner = await assertOwner(request, roomId);

    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`parent-invite:${owner.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const observerCount = await countRoomObservers(roomId);
    if (observerCount >= 1) {
      return Response.json({ error: "В семье уже есть второй родитель" }, { status: 409 });
    }

    let body: { name?: string };
    try {
      body = await request.json().catch(() => ({}));
    } catch {
      body = {};
    }

    const token = await createBindToken(roomId, "observer", body.name);
    const origin = new URL(request.url).origin;
    const bindUrl = `${origin}/tools/family/parent/join?token=${encodeURIComponent(token)}`;

    return Response.json({ token, bindUrl, role: "observer" as const });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
