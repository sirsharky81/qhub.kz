export function isShareWsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHARE_WS === "1";
}

export function shareWsUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SHARE_WS_URL?.trim();
  if (explicit) return explicit;

  if (typeof window === "undefined") return null;
  if (!isShareWsEnabled()) return null;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${proto}//${host}/ws/share`;
}
