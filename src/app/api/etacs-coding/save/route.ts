import { isAdminAuthenticated } from "@/lib/admin/session";
import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import { checkEtacsAccess } from "@/lib/etacs-coding/licensing";
import { saveEtacsPayload } from "@/lib/etacs-coding/service";

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  try {
    const payload = (await request.json()) as Parameters<typeof saveEtacsPayload>[0] & {
      promoCode?: string;
    };
    const isAdmin = await isAdminAuthenticated().catch(() => false);
    const access = await checkEtacsAccess({
      vin: payload.vin,
      promoCode: payload.promoCode,
      isAdmin,
    });
    if (!access.allowed) {
      return etacsJson(
        request,
        {
          error: `Для сохранения изменённого файла и записи в блок активируйте доступ для VIN ${payload.vin || "автомобиля"} или введите код PRO.`,
          code: "PAYMENT_REQUIRED",
          vin: payload.vin,
        },
        402,
      );
    }

    const result = saveEtacsPayload(payload);
    return etacsJson(request, result);
  } catch (error) {
    return etacsError(request, error);
  }
}
