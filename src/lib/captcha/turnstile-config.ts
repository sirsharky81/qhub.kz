/** Server/runtime Turnstile config (reads env at request time, not only at build). */
export function getTurnstilePublicConfig(): { enabled: boolean; siteKey: string } {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const enabled = Boolean(siteKey && secretKey);
  return {
    enabled,
    siteKey: enabled ? siteKey : "",
  };
}
