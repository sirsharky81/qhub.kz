const SCAN_RESULT_PREFIX = "scan_result_";
const SCAN_RESULT_SHADOW_SUFFIX = "__shadow";

export function storeScanResult(raw: string): string {
  const key = `${SCAN_RESULT_PREFIX}${crypto.randomUUID()}`;
  sessionStorage.setItem(key, raw);
  // React StrictMode in dev can remount the target page and consume twice.
  // Keep a one-time shadow copy so the second mount can still restore value.
  const shadowKey = `${key}${SCAN_RESULT_SHADOW_SUFFIX}`;
  sessionStorage.setItem(shadowKey, raw);
  // Best-effort cleanup for abandoned scan sessions.
  setTimeout(() => {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(shadowKey);
  }, 5 * 60 * 1000);
  return key;
}

export function consumeScanResult(scanKey: string): string | null {
  const raw = sessionStorage.getItem(scanKey);
  if (raw) {
    sessionStorage.removeItem(scanKey);
    return raw;
  }
  const shadowKey = `${scanKey}${SCAN_RESULT_SHADOW_SUFFIX}`;
  const shadow = sessionStorage.getItem(shadowKey);
  if (shadow) {
    sessionStorage.removeItem(shadowKey);
    return shadow;
  }
  return null;
}

export function buildReturnRedirect(returnTo: string, raw: string): string {
  const scanKey = storeScanResult(raw);
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.set("scanKey", scanKey);
  return url.pathname + url.search;
}
