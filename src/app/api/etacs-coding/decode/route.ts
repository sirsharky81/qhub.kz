import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { decodeEtacsPayload } from "@/lib/etacs-coding/service";

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  try {
    const payload = (await request.json()) as Parameters<typeof decodeEtacsPayload>[0];
    const view = decodeEtacsPayload(payload);
    return etacsJson(request, {
      rows: view.rows,
      profileId: view.profileId,
      availableProfiles: view.availableProfiles,
      model: view.model,
      unit: view.unit,
      matchesBaseline: view.matchesBaseline,
      crcComputed: view.crcComputed,
      crcVerified: view.crcVerified,
    });
  } catch (error) {
    return etacsError(request, error);
  }
}
