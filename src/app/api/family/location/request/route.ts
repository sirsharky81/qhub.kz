import { randomUUID } from "crypto";
import { checkFamilyLocationRequestRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { sendFamilyLocationRequestPush } from "@/lib/family/push-server";
import {
  getMember,
  getPushSubscriptions,
  saveLocationRequest,
} from "@/lib/family/store";
import type { FamilyLocationRequestMode } from "@/lib/family/types";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    if (member.role !== "owner" && member.role !== "observer") {
      return Response.json({ error: "Только для родителей" }, { status: 403 });
    }

    let body: { targetMemberId?: string; mode?: FamilyLocationRequestMode };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const targetMemberId = body.targetMemberId?.trim();
    if (!targetMemberId) {
      return Response.json({ error: "Укажите участника" }, { status: 400 });
    }

    const mode: FamilyLocationRequestMode = body.mode === "silent" ? "silent" : "notify";

    const { allowed, retryAfterSec } = await checkFamilyLocationRequestRateLimit(
      member.memberId,
      targetMemberId,
      mode,
    );
    if (!allowed) {
      return Response.json(
        { error: "Подождите перед повторным запросом" },
        {
          status: 429,
          headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
        },
      );
    }

    const target = await getMember(targetMemberId);
    if (!target || target.roomId !== member.roomId) {
      return Response.json({ error: "Участник не найден" }, { status: 404 });
    }
    if (target.role !== "tracked") {
      return Response.json({ error: "Запрос доступен только для отслеживаемых участников" }, { status: 400 });
    }
    if (target.shareLocationWithParents === false) {
      return Response.json({ error: "Участник не делится геопозицией" }, { status: 403 });
    }

    const requestId = randomUUID();
    const locationRequest = await saveLocationRequest(targetMemberId, {
      requestId,
      requestedBy: member.memberId,
      mode,
    });

    const subs = await getPushSubscriptions(targetMemberId);
    const pushSent = await sendFamilyLocationRequestPush(subs, {
      mode,
      requestId,
      parentName: member.name,
    });

    return Response.json({
      ok: true,
      request: locationRequest,
      pushSent,
      hasSubscriptions: subs.length > 0,
    });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
