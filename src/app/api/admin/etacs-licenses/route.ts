import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import {
  approveEtacsUnlockRequest,
  createEtacsPromoCode,
  deleteEtacsPromoCode,
  loadEtacsBillingStore,
  removeUnlockedVin,
  resetEtacsPromoDevices,
  unlockVinManually,
  updateEtacsBillingSettings,
  type EtacsPromoCodeRecord,
  type EtacsVinAccessScope,
} from "@/lib/etacs-coding/licensing";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await loadEtacsBillingStore();
  return NextResponse.json(store);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      action:
        | "unlock_vin"
        | "remove_vin"
        | "create_promo"
        | "delete_promo"
        | "reset_promo_devices"
        | "approve_request"
        | "update_settings";
      vin?: string;
      scope?: EtacsVinAccessScope;
      ecuId?: string;
      contact?: string;
      note?: string;
      durationDays?: number | null;
      customCode?: string;
      kind?: EtacsPromoCodeRecord["kind"];
      maxUses?: number;
      maxDevices?: number;
      code?: string;
      requestId?: string;
      enforcePaywall?: boolean;
      cufVinPriceKzt?: number;
      singleVinPriceKzt?: number;
      proMonthPriceKzt?: number;
      proYearPriceKzt?: number;
      cufVinPriceRub?: number;
      singleVinPriceRub?: number;
      proMonthPriceRub?: number;
      proYearPriceRub?: number;
      paymentInstructions?: string;
      kaspiPhoneOrLink?: string;
      sbpInstructions?: string;
      sbpPhoneOrBank?: string;
    };

    switch (body.action) {
      case "unlock_vin": {
        await unlockVinManually({
          vin: body.vin || "",
          scope: body.scope ?? "full",
          ecuId: body.ecuId,
          contact: body.contact,
          note: body.note,
          durationDays: body.durationDays,
        });
        break;
      }
      case "remove_vin": {
        await removeUnlockedVin(body.vin || "");
        break;
      }
      case "create_promo": {
        await createEtacsPromoCode({
          customCode: body.customCode,
          kind: body.kind || "cuf_single_vin",
          maxUses: body.maxUses,
          maxDevices: body.maxDevices,
          durationDays: body.durationDays,
          note: body.note,
        });
        break;
      }
      case "delete_promo": {
        await deleteEtacsPromoCode(body.code || "");
        break;
      }
      case "reset_promo_devices": {
        await resetEtacsPromoDevices(body.code || "");
        break;
      }
      case "approve_request": {
        await approveEtacsUnlockRequest(body.requestId || "");
        break;
      }
      case "update_settings": {
        await updateEtacsBillingSettings({
          ...(typeof body.enforcePaywall === "boolean"
            ? { enforcePaywall: body.enforcePaywall }
            : {}),
          ...(typeof body.cufVinPriceKzt === "number"
            ? { cufVinPriceKzt: body.cufVinPriceKzt }
            : {}),
          ...(typeof body.singleVinPriceKzt === "number"
            ? { singleVinPriceKzt: body.singleVinPriceKzt }
            : {}),
          ...(typeof body.proMonthPriceKzt === "number"
            ? { proMonthPriceKzt: body.proMonthPriceKzt }
            : {}),
          ...(typeof body.proYearPriceKzt === "number"
            ? { proYearPriceKzt: body.proYearPriceKzt }
            : {}),
          ...(typeof body.cufVinPriceRub === "number"
            ? { cufVinPriceRub: body.cufVinPriceRub }
            : {}),
          ...(typeof body.singleVinPriceRub === "number"
            ? { singleVinPriceRub: body.singleVinPriceRub }
            : {}),
          ...(typeof body.proMonthPriceRub === "number"
            ? { proMonthPriceRub: body.proMonthPriceRub }
            : {}),
          ...(typeof body.proYearPriceRub === "number"
            ? { proYearPriceRub: body.proYearPriceRub }
            : {}),
          ...(typeof body.paymentInstructions === "string"
            ? { paymentInstructions: body.paymentInstructions }
            : {}),
          ...(typeof body.kaspiPhoneOrLink === "string"
            ? { kaspiPhoneOrLink: body.kaspiPhoneOrLink }
            : {}),
          ...(typeof body.sbpInstructions === "string"
            ? { sbpInstructions: body.sbpInstructions }
            : {}),
          ...(typeof body.sbpPhoneOrBank === "string"
            ? { sbpPhoneOrBank: body.sbpPhoneOrBank }
            : {}),
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    const updated = await loadEtacsBillingStore();
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
