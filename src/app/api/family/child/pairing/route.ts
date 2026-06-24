import { checkFamilyRateLimit, getClientIp } from "@/lib/rate-limit";
import { jsonFamilyAuthError } from "@/lib/family/guard";
import { createChildPairing, getPairingStatus } from "@/lib/family/store";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`child-pair:${ip}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const result = await createChildPairing(body.name ?? "Участник");
    const origin = new URL(request.url).origin;
    const qrUrl = `${origin}/tools/family/parent/scan?token=${encodeURIComponent(result.pairToken)}`;

    return Response.json({ ...result, qrUrl });
  } catch (err) {
    console.error("[family/child/pairing] POST failed:", err);
    return Response.json({ error: "Не удалось создать QR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pairToken = url.searchParams.get("token") ?? "";
    const accessToken = url.searchParams.get("accessToken") ?? "";

    if (!pairToken || !accessToken) {
      return Response.json({ error: "Укажите token и accessToken" }, { status: 400 });
    }

    const status = await getPairingStatus(pairToken, accessToken);
    if (!status) {
      return Response.json({ error: "pair_expired" }, { status: 410 });
    }

    return Response.json(status);
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
