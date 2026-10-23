import { isAdminAuthenticated } from "@/lib/admin/session";
import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import {
  checkEtacsAccess,
  detectFileKindForBilling,
} from "@/lib/etacs-coding/licensing";
import { saveEtacsPayload } from "@/lib/etacs-coding/service";

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  try {
    const payload = (await request.json()) as Parameters<typeof saveEtacsPayload>[0] & {
      promoCode?: string;
    };
    const isAdmin = await isAdminAuthenticated().catch(() => false);
    const fileKind = detectFileKindForBilling(payload.fileName, payload.codingHex);
    const access = await checkEtacsAccess({
      vin: payload.vin,
      promoCode: payload.promoCode,
      fileKind,
      isAdmin,
    });
    if (!access.allowed) {
      const msg =
        access.reason === "cuf_only_need_kon_upgrade"
          ? `Для VIN ${payload.vin || "автомобиля"} открыт тариф Custom (.cuf). Для сохранения и записи комплектации Variant (.kon) откройте полный доступ (.kon + .cuf) или введите код PRO.`
          : fileKind === "cuf"
            ? `Для сохранения и записи Custom Coding (.cuf) активируйте доступ .cuf (${access.settings.cufVinPriceKzt.toLocaleString("ru")} ₸) для VIN ${payload.vin || "автомобиля"} или введите код.`
            : `Для сохранения и записи Variant Coding (.kon) активируйте полный доступ (.kon + .cuf) для VIN ${payload.vin || "автомобиля"} или введите код PRO.`;
      return etacsJson(
        request,
        {
          error: msg,
          code: "PAYMENT_REQUIRED",
          vin: payload.vin,
          fileKind,
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
