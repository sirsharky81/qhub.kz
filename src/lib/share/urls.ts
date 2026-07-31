import { SHARE_BASE_PATH, SHARE_INVITE_PARAM } from "./constants";

export function buildShareInviteUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
  const url = new URL(SHARE_BASE_PATH, base);
  url.searchParams.set(SHARE_INVITE_PARAM, token);
  return url.toString();
}

export function parseShareInviteFromUrl(href: string): string | null {
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
    const path = url.pathname.replace(/\/$/, "");
    if (path !== SHARE_BASE_PATH && path !== `${SHARE_BASE_PATH}/room` && path !== `${SHARE_BASE_PATH}/join`) {
      return null;
    }
    const token = url.searchParams.get(SHARE_INVITE_PARAM)?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function isShareInviteUrl(raw: string): boolean {
  return parseShareInviteFromUrl(raw) !== null;
}
