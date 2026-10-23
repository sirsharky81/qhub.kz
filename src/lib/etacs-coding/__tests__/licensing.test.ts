import { beforeEach, describe, expect, it } from "vitest";
import {
  approveEtacsUnlockRequest,
  checkEtacsAccess,
  createEtacsPromoCode,
  createEtacsUnlockRequest,
  redeemEtacsPromoCode,
  resetEtacsBillingMemoryCache,
  saveEtacsBillingStore,
  signQuickApproveToken,
  unlockVinManually,
  updateEtacsBillingSettings,
  verifyQuickApproveToken,
} from "../licensing";

describe("ETACS Coding licensing & monetization store", () => {
  beforeEach(async () => {
    resetEtacsBillingMemoryCache();
    await saveEtacsBillingStore({
      settings: {
        enforcePaywall: true,
        singleVinPriceKzt: 3000,
        proMonthPriceKzt: 8000,
        proYearPriceKzt: 30000,
        paymentInstructions: "Kaspi transfer",
        kaspiPhoneOrLink: "+7 701 000 0000",
      },
      unlockedVins: {},
      promoCodes: {},
      requests: [],
    });
  });

  it("blocks unactivated VIN when enforcePaywall is true and unlocks after manual VIN unlock", async () => {
    const vin = "MMEMCY1XXNH003447";
    const before = await checkEtacsAccess({ vin });
    expect(before.allowed).toBe(false);
    expect(before.reason).toBe("locked");

    await unlockVinManually({ vin, ecuId: "8637C671", note: "Test owner" });
    const after = await checkEtacsAccess({ vin });
    expect(after.allowed).toBe(true);
    expect(after.reason).toBe("vin_unlocked");
  });

  it("allows single-VIN promo code redemption and locks second distinct VIN", async () => {
    const promo = await createEtacsPromoCode({
      customCode: "VIN-TEST01",
      kind: "single_vin",
    });
    expect(promo.code).toBe("VIN-TEST01");

    const redeem1 = await redeemEtacsPromoCode({
      code: "VIN-TEST01",
      vin: "MMEMCY1XXNH003447",
      ecuId: "8637C671",
    });
    expect(redeem1.ok).toBe(true);

    const check1 = await checkEtacsAccess({ vin: "MMEMCY1XXNH003447" });
    expect(check1.allowed).toBe(true);
    expect(check1.reason).toBe("vin_unlocked");

    // Second different VIN with the same 1-VIN code should be rejected
    await expect(
      redeemEtacsPromoCode({
        code: "VIN-TEST01",
        vin: "JMBXKR1WHEZ000999",
      }),
    ).rejects.toThrow(/исчерпан/);
  });

  it("supports unlimited PRO promo codes across any VIN", async () => {
    const pro = await createEtacsPromoCode({
      customCode: "PRO-MASTER77",
      kind: "pro_unlimited",
      durationDays: 30,
    });
    expect(pro.kind).toBe("pro_unlimited");

    const accessA = await checkEtacsAccess({
      vin: "MMEMCY1XXNH003447",
      promoCode: "PRO-MASTER77",
    });
    expect(accessA.allowed).toBe(true);
    expect(accessA.reason).toBe("pro_code");

    const accessB = await checkEtacsAccess({
      vin: "JMBXKR1WHEZ000888",
      promoCode: "PRO-MASTER77",
    });
    expect(accessB.allowed).toBe(true);
    expect(accessB.reason).toBe("pro_code");
  });

  it("creates unlock requests, signs Telegram quick-approve tokens, and approves requests", async () => {
    const req = await createEtacsUnlockRequest({
      vin: "MMEMCY1XXNH003447",
      ecuId: "8637C671",
      contact: "+77015554433",
      plan: "single_vin",
      comment: "Kaspi 3000",
    });
    expect(req.status).toBe("pending");

    const token = signQuickApproveToken(req.id);
    expect(verifyQuickApproveToken(req.id, token)).toBe(true);
    expect(verifyQuickApproveToken(req.id, "invalid")).toBe(false);

    const approved = await approveEtacsUnlockRequest(req.id);
    expect(approved.request.status).toBe("approved");

    const access = await checkEtacsAccess({ vin: "MMEMCY1XXNH003447" });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("vin_unlocked");
  });

  it("allows free access when enforcePaywall is toggled off in admin settings", async () => {
    await updateEtacsBillingSettings({ enforcePaywall: false });
    const access = await checkEtacsAccess({ vin: "ANYVIN00000000001" });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("paywall_disabled");
  });
});
