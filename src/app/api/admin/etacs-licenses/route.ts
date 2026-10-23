import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import {
  approveEtacsUnlockRequest,
  createEtacsPromoCode,
  deleteEtacsPromoCode,
  loadEtacsBillingStore,
  removeUnlockedVin,
  unlockVinManually,
  updateEtacsBillingSettings,
  type EtacsPromoCodeRecord,
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
        | "approve_request"
        | "update_settings";
      vin?: string;
      ecuId?: string;
      contact?: string;
      note?: string;
      durationDays?: number | null;
      customCode?: string;
      kind?: EtacsPromoCodeRecord["kind"];
      maxUses?: number;
      code?: string;
      requestId?: string;
      enforcePaywall?: boolean;
      singleVinPriceKzt?: number;
      proMonthPriceKzt?: number;
      proYearPriceKzt?: number;
      paymentInstructions?: string;
      kaspiPhoneOrLink?: string;
    };

    switch (body.action) {
      case "unlock_vin": {
        await unlockVinManually({
          vin: body.vin || "",
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
          kind: body.kind || "single_vin",
          maxUses: body.maxUses,
          durationDays: body.durationDays,
          note: body.note,
        });
        break;
      }
      case "delete_promo": {
        await deleteEtacsPromoCode(body.code || "");
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
          ...(typeof body.singleVinPriceKzt === "number"
            ? { singleVinPriceKzt: body.singleVinPriceKzt }
            : {}),
          ...(typeof body.proMonthPriceKzt === "number"
            ? { proMonthPriceKzt: body.proMonthPriceKzt }
            : {}),
          ...(typeof body.proYearPriceKzt === "number"
            ? { proYearPriceKzt: body.proYearPriceKzt }
            : {}),
          ...(typeof body.paymentInstructions === "string"
            ? { paymentInstructions: body.paymentInstructions }
            : {}),
          ...(typeof body.kaspiPhoneOrLink === "string"
            ? { kaspiPhoneOrLink: body.kaspiPhoneOrLink }
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
