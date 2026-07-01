import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import {
  getMessengerPushSubscriptions,
  saveMessengerPushSubscriptions,
} from "@/lib/messenger/push-store";
import type { MessengerPushSubscription } from "@/lib/messenger/types";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`push:${phone}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { subscription?: MessengerPushSubscription; remove?: boolean };
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

    let subs = await getMessengerPushSubscriptions(phone);
    if (body.remove) {
      subs = subs.filter((s) => s.endpoint !== sub.endpoint);
    } else {
      subs = subs.filter((s) => s.endpoint !== sub.endpoint);
      subs.push(sub);
    }

    await saveMessengerPushSubscriptions(phone, subs);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
