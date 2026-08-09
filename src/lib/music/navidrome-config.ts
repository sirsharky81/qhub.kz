/** Remote Music (Navidrome on Synology via Tailscale) — см. docs/synology-tailscale.md */

export function isMusicRemoteConfigured(): boolean {
  const enabled = process.env.MUSIC_REMOTE_ENABLED === "1" || process.env.MUSIC_REMOTE_ENABLED === "true";
  const url = process.env.MUSIC_NAV_URL?.trim();
  const user = process.env.MUSIC_NAV_USER?.trim();
  const pass = process.env.MUSIC_NAV_PASS?.trim();
  return Boolean(enabled && url && user && pass);
}

export function getNavidromeConfig(): { baseUrl: string; user: string; pass: string } {
  const baseUrl = process.env.MUSIC_NAV_URL?.trim().replace(/\/$/, "") ?? "";
  const user = process.env.MUSIC_NAV_USER?.trim() ?? "";
  const pass = process.env.MUSIC_NAV_PASS?.trim() ?? "";
  if (!baseUrl || !user || !pass) {
    throw new Error("Navidrome не настроен (MUSIC_NAV_URL / MUSIC_NAV_USER / MUSIC_NAV_PASS)");
  }
  return { baseUrl, user, pass };
}
