import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { updateLocation } from "@/lib/family/store";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`loc:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { lat?: number; lng?: number; accuracy?: number; battery?: number | null };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const accuracy = Number(body.accuracy ?? 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "Некорректные координаты" }, { status: 400 });
    }

    const location = await updateLocation(member.memberId, {
      lat,
      lng,
      accuracy,
      battery: body.battery ?? null,
    });

    return Response.json({ ok: true, location });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
