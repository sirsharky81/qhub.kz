import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { getPushSubscriptions, savePushSubscriptions } from "@/lib/family/store";
import type { FamilyPushSubscription } from "@/lib/family/types";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    if (member.role === "tracked") {
      return Response.json({ error: "Только для наблюдателей" }, { status: 403 });
    }

    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`push:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { subscription?: FamilyPushSubscription; remove?: boolean };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const sub = body.subscription;
    if (!sub?.endpoint) {
      return Response.json({ error: "Неполная подписка" }, { status: 400 });
    }

    const isNative =
      Boolean(sub.nativeToken) ||
      sub.platform === "ios" ||
      sub.platform === "android" ||
      sub.keys?.p256dh === "native";

    if (!isNative && (!sub.keys?.p256dh || !sub.keys?.auth)) {
      return Response.json({ error: "Неполная подписка" }, { status: 400 });
    }

    let subs = await getPushSubscriptions(member.memberId);
    if (body.remove) {
      subs = subs.filter((s) => s.endpoint !== sub.endpoint);
    } else {
      subs = subs.filter((s) => s.endpoint !== sub.endpoint);
      subs.push(sub);
    }

    await savePushSubscriptions(member.memberId, subs);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
