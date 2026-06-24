import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertFamilyMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { setShareLocationWithChildren, setShareLocationWithParents } from "@/lib/family/store";

export async function POST(request: Request) {
  try {
    const member = await assertFamilyMember(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`share-loc:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { enabled?: boolean; target?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    if (typeof body.enabled !== "boolean") {
      return Response.json({ error: "Укажите enabled" }, { status: 400 });
    }

    const target = body.target === "parents" ? "parents" : "children";
    const updated =
      target === "parents"
        ? await setShareLocationWithParents(member.memberId, body.enabled)
        : await setShareLocationWithChildren(member.memberId, body.enabled);

    return Response.json({
      ok: true,
      shareLocationWithChildren: updated.shareLocationWithChildren ?? false,
      shareLocationWithParents: updated.shareLocationWithParents ?? false,
    });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
