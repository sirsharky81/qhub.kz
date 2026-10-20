import {
  etacsError,
  etacsGuard,
  etacsJson,
  readParseBuffer,
} from "@/lib/etacs-coding/api-route";
import { parseEtacsBuffer } from "@/lib/etacs-coding/service";

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const fileName = url.searchParams.get("fileName") || "";
  const profileId = url.searchParams.get("profileId") || "";

  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    const sizeError = readParseBuffer(buffer);
    if (sizeError) return sizeError;
    const view = parseEtacsBuffer(buffer, { fileName, profileId });
    return etacsJson(request, view);
  } catch (error) {
    return etacsError(request, error);
  }
}
