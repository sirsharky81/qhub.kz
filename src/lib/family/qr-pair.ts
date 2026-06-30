const PAIR_TOKEN_HEX_LEN = 48;
const PAIR_QR_PREFIX = "qhub-family:";

export const FAMILY_PAIR_SHARE_ORIGIN =
  process.env.NEXT_PUBLIC_NATIVE_API_BASE?.replace(/\/$/, "") || "https://www.qhub.kz";

/** Compact QR payload — avoids long localhost URLs that scanners truncate. */
export function buildChildPairQrPayload(pairToken: string): string {
  return `${PAIR_QR_PREFIX}${pairToken}`;
}

/** Share link for messengers (human-readable URL). */
export function buildChildPairShareUrl(pairToken: string): string {
  return `${FAMILY_PAIR_SHARE_ORIGIN}/tools/family/parent/scan?token=${encodeURIComponent(pairToken)}`;
}

const HEX_TOKEN_RE = /^[a-f0-9]{48}$/i;

export function normalizePairToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(PAIR_QR_PREFIX)) {
    const token = trimmed.slice(PAIR_QR_PREFIX.length).trim();
    return HEX_TOKEN_RE.test(token) ? token.toLowerCase() : token.length >= 32 ? token : null;
  }

  if (HEX_TOKEN_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

/** Parse scanned QR text or pasted URL into a pair token. */
export function parseParentScanPayload(raw: string): { token: string | null; truncated: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { token: null, truncated: false };

  const fromCompact = normalizePairToken(trimmed);
  if (fromCompact) return { token: fromCompact, truncated: false };

  try {
    let href = trimmed;
    if (/^www\./i.test(href)) href = `https://${href}`;
    if (!/^https?:\/\//i.test(href) && href.includes("token=")) {
      href = `https://local.invalid/?${href.includes("?") ? href.split("?")[1] : href}`;
    }
    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href);
      const token = u.searchParams.get("token")?.trim() ?? "";
      if (token) {
        const normalized = normalizePairToken(token) ?? (HEX_TOKEN_RE.test(token) ? token.toLowerCase() : null);
        const truncated = token.length > 0 && token.length < PAIR_TOKEN_HEX_LEN && !normalized;
        return { token: normalized, truncated };
      }
    }
  } catch {
    /* not a URL */
  }

  if (/^[a-f0-9]+$/i.test(trimmed) && trimmed.length < PAIR_TOKEN_HEX_LEN) {
    return { token: null, truncated: true };
  }

  return { token: null, truncated: false };
}
