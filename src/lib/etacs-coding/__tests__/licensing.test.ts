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

describe("ETACS Coding licensing & monetization store (.cuf vs .kon + .cuf tiers)", () => {
  beforeEach(async () => {
    resetEtacsBillingMemoryCache();
    await saveEtacsBillingStore({
      settings: {
        enforcePaywall: true,
        cufVinPriceKzt: 1500,
        singleVinPriceKzt: 3500,
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

  it("blocks unactivated VIN when enforcePaywall is true and unlocks full (.kon + .cuf) after manual full unlock", async () => {
    const vin = "MMEMCY1XXNH003447";
    const before = await checkEtacsAccess({ vin, fileKind: "cuf" });
    expect(before.allowed).toBe(false);
    expect(before.reason).toBe("locked");

    await unlockVinManually({ vin, scope: "full", ecuId: "8637C671", note: "Test owner" });
    const afterCuf = await checkEtacsAccess({ vin, fileKind: "cuf" });
    const afterKon = await checkEtacsAccess({ vin, fileKind: "kon" });
    expect(afterCuf.allowed).toBe(true);
    expect(afterKon.allowed).toBe(true);
    expect(afterKon.reason).toBe("vin_unlocked_full");
  });

  it("unlocks only .cuf with cuf_single_vin code while keeping .kon locked until full upgrade", async () => {
    const vin = "MMEMCY1XXNH003447";
    const cufCode = await createEtacsPromoCode({
      customCode: "CUF-MIRROR1",
      kind: "cuf_single_vin",
    });
    expect(cufCode.code).toBe("CUF-MIRROR1");

    const redeem = await redeemEtacsPromoCode({
      code: "CUF-MIRROR1",
      vin,
      ecuId: "8637C671",
    });
    expect(redeem.ok).toBe(true);
    expect(redeem.vinRecord?.scope).toBe("cuf_only");

    // .cuf is allowed
    const checkCuf = await checkEtacsAccess({ vin, fileKind: "cuf" });
    expect(checkCuf.allowed).toBe(true);
    expect(checkCuf.allowedCuf).toBe(true);
    expect(checkCuf.allowedKon).toBe(false);
    expect(checkCuf.reason).toBe("vin_unlocked_cuf");

    // .kon is still locked and prompts for upgrade
    const checkKon = await checkEtacsAccess({ vin, fileKind: "kon" });
    expect(checkKon.allowed).toBe(false);
    expect(checkKon.allowedCuf).toBe(true);
    expect(checkKon.allowedKon).toBe(false);
    expect(checkKon.reason).toBe("cuf_only_need_kon_upgrade");

    // Upgrading the same VIN with a full single_vin code unlocks .kon as well
    await createEtacsPromoCode({
      customCode: "VIN-FULL01",
      kind: "single_vin",
    });
    await redeemEtacsPromoCode({ code: "VIN-FULL01", vin });

    const checkKonAfterUpgrade = await checkEtacsAccess({ vin, fileKind: "kon" });
    expect(checkKonAfterUpgrade.allowed).toBe(true);
    expect(checkKonAfterUpgrade.allowedKon).toBe(true);
    expect(checkKonAfterUpgrade.reason).toBe("vin_unlocked_full");
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

    const check1 = await checkEtacsAccess({ vin: "MMEMCY1XXNH003447", fileKind: "kon" });
    expect(check1.allowed).toBe(true);
    expect(check1.reason).toBe("vin_unlocked_full");

    // Second different VIN with the same 1-VIN code should be rejected
    await expect(
      redeemEtacsPromoCode({
        code: "VIN-TEST01",
        vin: "JMBXKR1WHEZ000999",
      }),
    ).rejects.toThrow(/исчерпан/);
  });

  it("supports unlimited PRO promo codes across any VIN for both .kon and .cuf", async () => {
    const pro = await createEtacsPromoCode({
      customCode: "PRO-MASTER77",
      kind: "pro_unlimited",
      durationDays: 30,
    });
    expect(pro.kind).toBe("pro_unlimited");

    const accessA = await checkEtacsAccess({
      vin: "MMEMCY1XXNH003447",
      promoCode: "PRO-MASTER77",
      fileKind: "kon",
    });
    expect(accessA.allowed).toBe(true);
    expect(accessA.reason).toBe("pro_code");

    const accessB = await checkEtacsAccess({
      vin: "JMBXKR1WHEZ000888",
      promoCode: "PRO-MASTER77",
      fileKind: "cuf",
    });
    expect(accessB.allowed).toBe(true);
    expect(accessB.reason).toBe("pro_code");
  });

  it("creates cuf_vin unlock requests, signs Telegram quick-approve tokens, and approves cuf_only scope", async () => {
    const req = await createEtacsUnlockRequest({
      vin: "MMEMCY1XXNH003447",
      ecuId: "8637C671",
      contact: "+77015554433",
      plan: "cuf_vin",
      comment: "Kaspi 1500 for mirrors",
    });
    expect(req.status).toBe("pending");

    const token = signQuickApproveToken(req.id);
    expect(verifyQuickApproveToken(req.id, token)).toBe(true);
    expect(verifyQuickApproveToken(req.id, "invalid")).toBe(false);

    const approved = await approveEtacsUnlockRequest(req.id);
    expect(approved.request.status).toBe("approved");
    expect(approved.vinRecord?.scope).toBe("cuf_only");

    const accessCuf = await checkEtacsAccess({ vin: "MMEMCY1XXNH003447", fileKind: "cuf" });
    expect(accessCuf.allowed).toBe(true);
    expect(accessCuf.reason).toBe("vin_unlocked_cuf");

    const accessKon = await checkEtacsAccess({ vin: "MMEMCY1XXNH003447", fileKind: "kon" });
    expect(accessKon.allowed).toBe(false);
    expect(accessKon.reason).toBe("cuf_only_need_kon_upgrade");

    // Rejects cuf_vin or single_vin request when VIN is missing (file not opened/read yet)
    await expect(
      createEtacsUnlockRequest({
        vin: "",
        contact: "+77071913395",
        plan: "cuf_vin",
      }),
    ).rejects.toThrow(/сначала откройте файл/i);
  });

  it("allows free access when enforcePaywall is toggled off in admin settings", async () => {
    await updateEtacsBillingSettings({ enforcePaywall: false });
    const access = await checkEtacsAccess({ vin: "ANYVIN00000000001", fileKind: "kon" });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("paywall_disabled");
  });
});
