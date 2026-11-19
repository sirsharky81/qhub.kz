import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { mutFunctionsForEcu } from "@/lib/etacs-coding/diag-catalog";

export async function GET(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const vkey = url.searchParams.get("vkey")?.trim() ?? "";
  const sysKey = Number(url.searchParams.get("sysKey"));
  if (!vkey || !Number.isInteger(sysKey)) {
    return etacsJson(request, { error: "Нужны vkey и sysKey" }, 400);
  }

  try {
    const list = mutFunctionsForEcu(vkey, sysKey, undefined, {
      diagVersion: url.searchParams.get("diagVersion"),
      partNumber: url.searchParams.get("partNumber"),
    });
    if (!list) return etacsJson(request, { error: "Actuator / Special function для блока не найдены" }, 404);
    return etacsJson(request, list);
  } catch (error) {
    return etacsError(request, error, 503);
  }
}