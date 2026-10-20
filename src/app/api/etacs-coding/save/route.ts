import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { saveEtacsPayload } from "@/lib/etacs-coding/service";

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  try {
    const payload = (await request.json()) as Parameters<typeof saveEtacsPayload>[0];
    const result = saveEtacsPayload(payload);
    return etacsJson(request, result);
  } catch (error) {
    return etacsError(request, error);
  }
}
