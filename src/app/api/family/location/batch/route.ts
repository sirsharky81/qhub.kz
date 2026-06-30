import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { updateLocation } from "@/lib/family/store";

const MAX_BATCH = 50;

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`loc-batch:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: {
      points?: Array<{
        lat?: number;
        lng?: number;
        accuracy?: number;
        battery?: number | null;
        timestamp?: number;
      }>;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const points = body.points;
    if (!Array.isArray(points) || points.length === 0) {
      return Response.json({ error: "Укажите points" }, { status: 400 });
    }

    const slice = points.slice(-MAX_BATCH);
    let lastLocation = null;
    for (const point of slice) {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      const accuracy = Number(point.accuracy ?? 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      lastLocation = await updateLocation(member.memberId, {
        lat,
        lng,
        accuracy,
        battery: point.battery ?? null,
      });
    }

    if (!lastLocation) {
      return Response.json({ error: "Некорректные координаты" }, { status: 400 });
    }

    return Response.json({ ok: true, location: lastLocation, processed: slice.length });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
