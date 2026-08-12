import { withCors } from "@/lib/api/cors";
import { mapCastError, resolveCastInput } from "@/lib/cast/resolve";
import { getPublicOrigin } from "@/lib/public-origin";
import { checkCastResolveRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkCastResolveRateLimit(`resolve:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { url?: string; password?: string; uploadId?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    const origin = getPublicOrigin(request);
    const result = await resolveCastInput(body.url ?? "", {
      password: body.password,
      uploadId: body.uploadId,
      origin,
    });

    return withCors(Response.json(result), request);
  } catch (err) {
    const mapped = mapCastError(err);
    const status =
      mapped.code === "youtube_not_supported"
        ? 422
        : mapped.code === "send_password_required"
          ? 401
          : mapped.code === "send_password_invalid"
            ? 403
            : 400;
    return withCors(Response.json({ error: mapped.message, code: mapped.code }, { status }), request);
  }
}
