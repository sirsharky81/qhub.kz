import { extractScannableUrl } from "@/lib/code-scanner/url-utils";

export type LinkifiedSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

const URL_CANDIDATE_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION_RE = /[.,!?;:\])}]+$/;

function normalizeCandidate(raw: string): { label: string; href: string } | null {
  const label = raw.replace(TRAILING_PUNCTUATION_RE, "");
  if (!label) return null;
  const href = extractScannableUrl(label);
  return href ? { label, href } : null;
}

export function splitTextWithLinks(text: string): LinkifiedSegment[] {
  if (!text) return [];
  const segments: LinkifiedSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_CANDIDATE_RE)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const normalized = normalizeCandidate(raw);
    if (!normalized) continue;

    if (index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, index) });
    }
    segments.push({ kind: "link", value: normalized.label, href: normalized.href });

    const suffix = raw.slice(normalized.label.length);
    if (suffix) segments.push({ kind: "text", value: suffix });
    cursor = index + raw.length;
  }

  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments.length ? segments : [{ kind: "text", value: text }];
}

export function extractHttpLinks(text: string): string[] {
  return splitTextWithLinks(text)
    .filter((segment): segment is Extract<LinkifiedSegment, { kind: "link" }> => segment.kind === "link")
    .map((segment) => segment.href);
}
