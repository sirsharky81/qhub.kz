function cleanEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

const DEFAULT_BASE_URL = "https://portal.kgd.gov.kz";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KgdTaxDebtConfig {
  baseUrl: string;
  portalToken: string;
  personalAccountToken: string;
}

/** У КГД X-Portal-Token — UUID, токен ЛС — обычно сплошной hex. */
export function assignKgdTokens(
  first: string,
  second: string,
): Pick<KgdTaxDebtConfig, "portalToken" | "personalAccountToken"> {
  if (UUID_RE.test(first) && !UUID_RE.test(second)) {
    return { portalToken: first, personalAccountToken: second };
  }
  if (UUID_RE.test(second) && !UUID_RE.test(first)) {
    return { portalToken: second, personalAccountToken: first };
  }
  return { portalToken: first, personalAccountToken: second };
}

export function getKgdTaxDebtConfig(): KgdTaxDebtConfig {
  const first =
    cleanEnv(process.env.KGD_PORTAL_TOKEN) || cleanEnv(process.env.KGD_PUBLIC_KEY);
  const second =
    cleanEnv(process.env.KGD_PERSONAL_ACCOUNT_TOKEN) ||
    cleanEnv(process.env.KGD_PRIVATE_KEY);
  return {
    baseUrl: cleanEnv(process.env.KGD_API_BASE_URL).replace(/\/$/, "") || DEFAULT_BASE_URL,
    ...assignKgdTokens(first, second),
  };
}

export function isKgdTaxDebtConfigured(): boolean {
  const config = getKgdTaxDebtConfig();
  return Boolean(config.portalToken && config.personalAccountToken);
}
