import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { describeCatalogDtcs } from "@/lib/etacs-coding/diag-catalog";

const CODE = /^[PCBU][0-9A-F]{4}$/;

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  let body: { dtcMasterId?: string; codes?: unknown };
  try {
    body = (await request.json()) as { dtcMasterId?: string; codes?: unknown };
  } catch {
    return etacsJson(request, { error: "Нужен мастер DTC и список кодов" }, 400);
  }

  const dtcMasterId = String(body.dtcMasterId ?? "").trim();
  const codes = Array.isArray(body.codes) ? body.codes.filter((code) => typeof code === "string") : [];
  if (!/^\d{2}$/.test(dtcMasterId) || codes.length === 0 || codes.length > 80) {
    return etacsJson(request, { error: "Нужен мастер DTC и список кодов" }, 400);
  }
  const safe = codes.map((code) => code.toUpperCase()).filter((code) => CODE.test(code));
  try {
    return etacsJson(request, { descriptions: describeCatalogDtcs(dtcMasterId, safe) });
  } catch (error) {
    return etacsError(request, error, 503);
  }
}
