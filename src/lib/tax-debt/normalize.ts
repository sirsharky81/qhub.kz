import { debtAmount, asText, formatReportDate } from "./format";
import type { BccArrear, TaxDebtResult, TaxOrgDebt } from "./types";

interface RawBcc {
  bcc?: unknown;
  bccNameRu?: unknown;
  bccNameKz?: unknown;
  taxArrear?: unknown;
  poenaArrear?: unknown;
  fineArrear?: unknown;
  percentArrear?: unknown;
  totalArrear?: unknown;
}

interface RawTaxpayerInfo {
  iinBin?: unknown;
  nameRu?: unknown;
  nameKz?: unknown;
  taxArrear?: unknown;
  poenaArrear?: unknown;
  percentArrear?: unknown;
  fineArrear?: unknown;
  totalArrear?: unknown;
  bccArrearsInfos?: RawBcc[];
}

interface RawTaxOrg {
  charCode?: unknown;
  nameRu?: unknown;
  nameKz?: unknown;
  reportAcrualDate?: unknown;
  reportAccrualDate?: unknown;
  totalArrear?: unknown;
  totalTaxArrear?: unknown;
  pensionContributionArrear?: unknown;
  socialContributionArrear?: unknown;
  socialHealthInsuranceArrear?: unknown;
  taxpayerInfo?: RawTaxpayerInfo | RawTaxpayerInfo[];
}

export interface RawTaxDebtPayload {
  iinBin?: unknown;
  name?: unknown;
  nameRu?: unknown;
  nameKz?: unknown;
  totalArrear?: unknown;
  totalTaxArrear?: unknown;
  pensionContributionArrear?: unknown;
  socialContributionArrear?: unknown;
  socialHealthInsuranceArrear?: unknown;
  taxOrgInfos?: RawTaxOrg[];
}

function pickName(lang: "ru" | "kk", ru: unknown, kz: unknown, fallback = ""): string {
  const ruText = asText(ru);
  const kzText = asText(kz);
  if (lang === "kk") return kzText || ruText || fallback;
  return ruText || kzText || fallback;
}

function asTaxpayerInfo(value: RawTaxOrg["taxpayerInfo"]): RawTaxpayerInfo | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeBcc(raw: RawBcc, lang: "ru" | "kk"): BccArrear {
  return {
    bcc: asText(raw.bcc),
    bccName: pickName(lang, raw.bccNameRu, raw.bccNameKz),
    taxArrear: debtAmount(raw.taxArrear),
    poenaArrear: debtAmount(raw.poenaArrear),
    fineArrear: debtAmount(raw.fineArrear),
    percentArrear: debtAmount(raw.percentArrear),
    totalArrear: debtAmount(raw.totalArrear),
  };
}

function normalizeOrg(raw: RawTaxOrg, lang: "ru" | "kk"): TaxOrgDebt {
  const taxpayer = asTaxpayerInfo(raw.taxpayerInfo);
  const bccArrears = (taxpayer?.bccArrearsInfos ?? []).map((item) => normalizeBcc(item, lang));
  const taxpayerArrears = {
    taxArrear: debtAmount(taxpayer?.taxArrear),
    poenaArrear: debtAmount(taxpayer?.poenaArrear),
    percentArrear: debtAmount(taxpayer?.percentArrear),
    fineArrear: debtAmount(taxpayer?.fineArrear),
    totalArrear: debtAmount(taxpayer?.totalArrear),
  };
  if (taxpayerArrears.totalArrear === 0 && bccArrears.length > 0) {
    taxpayerArrears.taxArrear = bccArrears.reduce((sum, row) => sum + row.taxArrear, 0);
    taxpayerArrears.poenaArrear = bccArrears.reduce((sum, row) => sum + row.poenaArrear, 0);
    taxpayerArrears.percentArrear = bccArrears.reduce((sum, row) => sum + row.percentArrear, 0);
    taxpayerArrears.fineArrear = bccArrears.reduce((sum, row) => sum + row.fineArrear, 0);
    taxpayerArrears.totalArrear = bccArrears.reduce((sum, row) => sum + row.totalArrear, 0);
  }
  return {
    charCode: asText(raw.charCode),
    name: pickName(lang, raw.nameRu, raw.nameKz),
    reportDate: formatReportDate(raw.reportAcrualDate ?? raw.reportAccrualDate),
    totalArrear: debtAmount(raw.totalArrear),
    totalTaxArrear: debtAmount(raw.totalTaxArrear),
    pensionContributionArrear: debtAmount(raw.pensionContributionArrear),
    socialContributionArrear: debtAmount(raw.socialContributionArrear),
    socialHealthInsuranceArrear: debtAmount(raw.socialHealthInsuranceArrear),
    taxpayerName: pickName(lang, taxpayer?.nameRu, taxpayer?.nameKz),
    taxpayerCode: asText(taxpayer?.iinBin),
    taxpayerArrears,
    bccArrears,
  };
}

export function normalizeTaxDebt(
  payload: RawTaxDebtPayload,
  taxpayerCode: string,
  lang: "ru" | "kk",
): TaxDebtResult {
  const orgs = (payload.taxOrgInfos ?? []).map((org) => normalizeOrg(org, lang));
  const namedOrg = orgs.find((org) => org.taxpayerName) ?? orgs[0];
  const taxpayerName =
    asText(payload.name) ||
    pickName(lang, payload.nameRu, payload.nameKz, namedOrg?.taxpayerName ?? "");

  const totalArrear = debtAmount(payload.totalArrear);
  const totalTaxArrear = debtAmount(payload.totalTaxArrear);
  const pensionContributionArrear = debtAmount(payload.pensionContributionArrear);
  const socialContributionArrear = debtAmount(payload.socialContributionArrear);
  const socialHealthInsuranceArrear = debtAmount(payload.socialHealthInsuranceArrear);

  return {
    taxpayerCode: asText(payload.iinBin) || taxpayerCode,
    taxpayerName,
    asOf: namedOrg?.reportDate ?? new Date().toLocaleDateString("ru-KZ"),
    hasDebt:
      totalArrear > 0 ||
      totalTaxArrear > 0 ||
      pensionContributionArrear > 0 ||
      socialContributionArrear > 0 ||
      socialHealthInsuranceArrear > 0 ||
      orgs.some((org) => org.totalArrear > 0),
    totalArrear,
    totalTaxArrear,
    pensionContributionArrear,
    socialContributionArrear,
    socialHealthInsuranceArrear,
    taxOrgs: orgs,
  };
}
