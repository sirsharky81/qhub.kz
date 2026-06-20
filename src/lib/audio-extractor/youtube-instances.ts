/** Public Piped API instances (may change over time). */
export const PIPED_API_BASES = [
  "https://pipedapi.syncpundit.io",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.leptons.xyz",
] as const;

/** Public Invidious API instances (may change over time). */
export const INVIDIOUS_API_BASES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://vid.puffyan.us",
] as const;

export function pipedApiBases(): string[] {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_PIPED_API_BASE?.trim() ||
        process.env.PIPED_API_BASE?.trim()
      : undefined;
  if (fromEnv) return [fromEnv.replace(/\/$/, ""), ...PIPED_API_BASES];
  return [...PIPED_API_BASES];
}

export function invidiousApiBases(): string[] {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_INVIDIOUS_API_BASE?.trim() ||
        process.env.INVIDIOUS_API_BASE?.trim()
      : undefined;
  if (fromEnv) return [fromEnv.replace(/\/$/, ""), ...INVIDIOUS_API_BASES];
  return [...INVIDIOUS_API_BASES];
}
