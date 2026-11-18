import { isAdminAuthenticated } from "@/lib/admin/session";
import { etacsError, etacsGuard, etacsJson } from "@/lib/etacs-coding/api-route";
import {
  checkEtacsAccess,
  detectFileKindForBilling,
} from "@/lib/etacs-coding/licensing";
import { saveEtacsPayload } from "@/lib/etacs-coding/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const b64 = url.searchParams.get("b64") || "";
  const rawName = url.searchParams.get("name") || "coding.kon";
  if (!b64 || b64.length > 16_384) {
    return new Response("Invalid download payload", { status: 400 });
  }
  const normalizedB64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(normalizedB64, "base64");
  const isCuf = /\.cuf(?=$|[^a-zA-Z])/i.test(rawName);
  const ext = isCuf ? ".cuf" : ".kon";
  const stem = rawName
    .split(/[/\\]/)
    .pop()!
    .replace(/\.(kon|cuf|bin|txt).*$/i, "")
    .replace(/[^\w.\-()+]+/g, "_")
    .replace(/[\s._-]+$/g, "");
  const safeName = `${stem || "coding"}${ext}`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const blocked = await etacsGuard(request);
  if (blocked) return blocked;

  try {
    const payload = (await request.json()) as Parameters<typeof saveEtacsPayload>[0] & {
      promoCode?: string;
      deviceId?: string;
    };
    const isAdmin = await isAdminAuthenticated().catch(() => false);
    const fileKind = detectFileKindForBilling(payload.fileName, payload.codingHex);
    const access = await checkEtacsAccess({
      vin: payload.vin,
      promoCode: payload.promoCode,
      deviceId: payload.deviceId,
      fileKind,
      isAdmin,
    });
    if (!access.allowed) {
      const msg =
        access.reason === "pro_device_limit_exceeded"
          ? "Превышен лимит привязанных устройств для вашего PRO-ключа. Передача ключа третьим лицам запрещена. Для сброса привязки обратитесь к администратору."
          : access.reason === "cuf_only_need_kon_upgrade"
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
