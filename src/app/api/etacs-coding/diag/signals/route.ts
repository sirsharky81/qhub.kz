import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { signalsForEcu } from "@/lib/etacs-coding/diag-catalog";

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
    const list = signalsForEcu(vkey, sysKey);
    if (!list) return etacsJson(request, { error: "Блок не найден в каталоге" }, 404);
    return etacsJson(request, list);
  } catch (error) {
    return etacsError(request, error, 503);
  }
}
