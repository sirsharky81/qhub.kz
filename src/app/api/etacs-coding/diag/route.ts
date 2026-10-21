import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { listCatalogVehicles, resolveCatalogVehicle } from "@/lib/etacs-coding/diag-catalog";

export async function GET(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const vin = url.searchParams.get("vin") ?? undefined;
  const chassis = url.searchParams.get("chassis") ?? undefined;
  const vkey = url.searchParams.get("vkey") ?? undefined;

  try {
    const vehicles = listCatalogVehicles();
    const vehicle =
      vin || chassis || vkey ? resolveCatalogVehicle({ vin, chassis, vkey }) : null;
    return etacsJson(request, { vehicles, vehicle });
  } catch (error) {
    return etacsError(request, error, 503);
  }
}
