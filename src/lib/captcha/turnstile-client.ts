/** Client-safe Turnstile helpers (no secret key). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

export function isTurnstileConfiguredOnClient(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

/** True when the login UI should show Turnstile and require a token before submit. */
export function isTurnstileRequired(): boolean {
  if (isTurnstileConfiguredOnClient()) return true;
  return process.env.NODE_ENV === "production";
}

export const CAPTCHA_REQUIRED_MSG = "Подтвердите, что вы не робот";
