import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { getObserverPushTargets, activateSos } from "@/lib/family/store";
import { sendFamilyPush } from "@/lib/family/push-server";
import { parentMapMemberUrl } from "@/lib/app-routes";

function formatCoord(value: number): string {
  return value.toFixed(5);
}

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    if (member.role !== "tracked") {
      return Response.json({ error: "Только для участников" }, { status: 403 });
    }

    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`sos:${member.memberId}`);
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
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "Некорректные координаты" }, { status: 400 });
    }

    const accuracy = Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : 0;
    const battery =
      body.battery === null || body.battery === undefined ? null : Number(body.battery);

    const sos = await activateSos(member.memberId, {
      lat,
      lng,
      accuracy,
      battery: Number.isFinite(battery as number) ? (battery as number) : null,
    });

    const mapUrl = parentMapMemberUrl(member.roomId, member.memberId);
    const pushBody = `Координаты: ${formatCoord(lat)}, ${formatCoord(lng)}`;

    const subs = await getObserverPushTargets(member.roomId);
    void sendFamilyPush(subs, {
      title: "SOS!",
      body: pushBody,
      url: mapUrl,
      action: "family:sos",
    });

    return Response.json({ ok: true, sos, mapUrl });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
