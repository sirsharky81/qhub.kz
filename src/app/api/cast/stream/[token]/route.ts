import { handleCastStreamRequest } from "@/lib/cast/stream-handler";
import { getPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const decoded = decodeURIComponent(token ?? "").trim();
  if (!decoded) {
    return Response.json({ error: "Токен не указан" }, { status: 400 });
  }

  const origin = getPublicOrigin(request);
  return handleCastStreamRequest(decoded, request, origin);
}
