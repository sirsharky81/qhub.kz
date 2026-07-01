/** Client-safe Turnstile helpers (no secret key). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

export const NATIVE_CLIENT_HEADER = "X-QHub-Client";
export const NATIVE_CLIENT_VALUE = "capacitor";

export function isTurnstileConfiguredOnClient(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

/** True when Turnstile is enabled for this deployment (web + native remote shell). */
export function isTurnstileRequired(): boolean {
  if (isTurnstileConfiguredOnClient()) return true;
  return process.env.NODE_ENV === "production";
}

/** True when the login UI should show Turnstile and require a token before submit. */
export function isTurnstileRequiredForUi(): boolean {
  return isTurnstileRequired();
}

export const CAPTCHA_REQUIRED_MSG = "Подтвердите, что вы не робот";
