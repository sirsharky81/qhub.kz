import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { isFamilyMemberType } from "@/lib/family/member-types";
import { adoptChildByPairToken } from "@/lib/family/store";
import { withCors } from "@/lib/api/cors";

export async function POST(request: Request) {
  try {
    const parent = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`adopt:${parent.memberId}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { pairToken?: string; childName?: string; memberType?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    const pairToken = body.pairToken?.trim();
    if (!pairToken) {
      return withCors(Response.json({ error: "Укажите pairToken" }, { status: 400 }), request);
    }

    const memberType =
      body.memberType && isFamilyMemberType(body.memberType) ? body.memberType : undefined;

    const result = await adoptChildByPairToken(parent.memberId, pairToken, body.childName, memberType);
    return withCors(Response.json({ ok: true, ...result }), request);
  } catch (err) {
    const response = jsonFamilyAuthError(err);
    return withCors(response, request);
  }
}
