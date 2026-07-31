import { normalizeRoomCodeInput } from "./room-codes";
import { isShareInviteUrl, parseShareInviteFromUrl } from "./urls";

/** Normalize pasted/typed join value into API joinInput (code, token, or URL). */
export function resolveShareJoinInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (isShareInviteUrl(trimmed)) {
    const token = parseShareInviteFromUrl(trimmed);
    if (token) return token;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const token = url.searchParams.get("t")?.trim();
      if (token) return token;
    } catch {
      /* fall through */
    }
  }

  if (/^[a-f0-9]{32}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return normalizeRoomCodeInput(trimmed);
}

export function looksLikeShareInvite(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isShareInviteUrl(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed) && /[?&]t=[a-f0-9]{32}/i.test(trimmed)) return true;
  if (/^[a-f0-9]{32}$/i.test(trimmed)) return true;
  return /^[\w-]{6,}$/i.test(trimmed);
}
