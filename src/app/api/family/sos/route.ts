import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { getObserverPushTargets, activateSos } from "@/lib/family/store";
import { sendFamilyPush } from "@/lib/family/push-server";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`sos:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { lat?: number; lng?: number };
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

    const sos = await activateSos(member.memberId, { lat, lng });

    const subs = await getObserverPushTargets(member.roomId);
    void sendFamilyPush(subs, {
      title: `SOS: ${member.name}`,
      body: "Требуется помощь! Нажмите, чтобы открыть карту.",
      url: `/tools/family/room/${member.roomId}`,
    });

    return Response.json({ ok: true, sos });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
