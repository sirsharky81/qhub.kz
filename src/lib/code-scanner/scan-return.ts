const SCAN_RESULT_PREFIX = "scan_result_";

export function storeScanResult(raw: string): string {
  const key = `${SCAN_RESULT_PREFIX}${crypto.randomUUID()}`;
  sessionStorage.setItem(key, raw);
  return key;
}

export function consumeScanResult(scanKey: string): string | null {
  const raw = sessionStorage.getItem(scanKey);
  if (raw) sessionStorage.removeItem(scanKey);
  return raw;
}

export function buildReturnRedirect(returnTo: string, raw: string): string {
  const scanKey = storeScanResult(raw);
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.set("scanKey", scanKey);
  return url.pathname + url.search;
}
