import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { leaveFamily } from "@/lib/family/store";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`leave:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    await leaveFamily(member.memberId);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
