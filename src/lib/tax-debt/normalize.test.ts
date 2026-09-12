import { describe, expect, it } from "vitest";
import { normalizeTaxDebt } from "./normalize";

describe("normalizeTaxDebt", () => {
  it("treats negative KGD amounts as arrears and picks localized names", () => {
    const result = normalizeTaxDebt(
      {
        iinBin: "850101300065",
        totalArrear: "-1200.50",
        totalTaxArrear: "-1000",
        pensionContributionArrear: 0,
        socialContributionArrear: "0",
        socialHealthInsuranceArrear: 200.5,
        taxOrgInfos: [
          {
            charCode: "6201",
            nameRu: "УГД Алматы",
            nameKz: "Алматы МКБ",
            reportAcrualDate: "2026-09-13T00:00:00.000+00:00",
            totalArrear: 1200.5,
            taxpayerInfo: {
              iinBin: "850101300065",
              nameRu: "Иванов Иван",
              nameKz: "Иванов Иван",
              taxArrear: -1000,
              poenaArrear: -200.5,
              percentArrear: 0,
              fineArrear: 0,
              totalArrear: 1200.5,
              bccArrearsInfos: [
                {
                  bcc: "101110",
                  bccNameRu: "ИПН",
                  taxArrear: 1000,
                  poenaArrear: 200.5,
                  fineArrear: 0,
                  percentArrear: 0,
                  totalArrear: 1200.5,
                },
              ],
            },
          },
        ],
      },
      "850101300065",
      "ru",
    );

    expect(result.hasDebt).toBe(true);
    expect(result.totalArrear).toBe(1200.5);
    expect(result.taxpayerName).toBe("Иванов Иван");
    expect(result.taxOrgs[0]?.name).toBe("УГД Алматы");
    expect(result.taxOrgs[0]?.reportDate).toBe("13.09.2026");
    expect(result.taxOrgs[0]?.bccArrears[0]?.bccName).toBe("ИПН");
    expect(result.taxOrgs[0]?.taxpayerArrears.taxArrear).toBe(1000);
    expect(result.taxOrgs[0]?.taxpayerArrears.poenaArrear).toBe(200.5);
  });

  it("marks a zero payload as no debt", () => {
    const result = normalizeTaxDebt(
      {
        iinBin: "850101300065",
        totalArrear: 0,
        taxOrgInfos: [],
      },
      "850101300065",
      "ru",
    );
    expect(result.hasDebt).toBe(false);
    expect(result.taxpayerCode).toBe("850101300065");
  });
});
