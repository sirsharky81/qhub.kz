import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertRoomMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { countRoomObservers, createBindToken } from "@/lib/family/store";

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const member = await assertRoomMember(request, roomId);
    if (member.role === "tracked") {
      return Response.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`bind-token:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { role?: "tracked" | "observer"; name?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const role = body.role === "observer" ? "observer" : "tracked";
    if (role === "observer" && member.role !== "owner") {
      return Response.json({ error: "Только создатель может приглашать родителей" }, { status: 403 });
    }
    if (role === "observer") {
      const observerCount = await countRoomObservers(roomId);
      if (observerCount >= 1) {
        return Response.json({ error: "В семье уже есть второй родитель" }, { status: 409 });
      }
    }

    const token = await createBindToken(roomId, role, body.name);

    const origin = new URL(request.url).origin;
    const bindPath = role === "observer" ? "/tools/family/parent/join" : "/tools/family/join";
    const bindUrl = `${origin}${bindPath}?token=${encodeURIComponent(token)}`;

    return Response.json({ token, bindUrl, role });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
