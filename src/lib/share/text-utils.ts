export const MAX_TEXT_BYTES = 64 * 1024;

export type ShareTextKind = "text" | "link";

export function detectTextKind(body: string): ShareTextKind {
  const trimmed = body.trim();
  if (!trimmed) return "text";
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && isLikelyUrl(lines[0]!)) return "link";
  return "text";
}

export function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
