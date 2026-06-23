export const CODE_SCANNER_SIMPLE_URL = "/tools/code-scanner?mode=simple";

export function extractScannableUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  try {
    let href = trimmed;
    if (/^www\./i.test(href)) href = `https://${href}`;
    if (!/^https?:\/\//i.test(href)) return null;
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function openUrlInNewTab(url: string): void {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** Same-origin links navigate in the current tab (e.g. lotto join QR). */
export function openScannedUrl(url: string): void {
  try {
    const target = new URL(url);
    if (target.origin === window.location.origin) {
      window.location.assign(url);
      return;
    }
  } catch {
    /* fall through */
  }
  openUrlInNewTab(url);
}
