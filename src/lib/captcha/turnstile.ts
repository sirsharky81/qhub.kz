const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

export const CAPTCHA_REQUIRED_MSG = "Подтвердите, что вы не робот";

export function isTurnstileConfigured(): boolean {
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

export function isTurnstileRequired(): boolean {
  if (isTurnstileConfigured()) return true;
  return process.env.NODE_ENV === "production";
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!token) return false;
  if (!TURNSTILE_SECRET_KEY) return false;

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** Rate limit → captcha gate for messenger auth routes. */
export async function assertTurnstile(
  captchaToken: string | undefined,
  remoteIp: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isTurnstileRequired()) {
    if (process.env.NODE_ENV === "development" && !isTurnstileConfigured()) {
      console.warn("[turnstile] Keys not set — skipping verification in development");
    }
    return { ok: true };
  }

  if (!isTurnstileConfigured()) {
    return {
      ok: false,
      error: "Проверка CAPTCHA временно недоступна",
      status: 503,
    };
  }

  const valid = await verifyTurnstileToken(captchaToken ?? "", remoteIp);
  if (!valid) {
    return {
      ok: false,
      error: CAPTCHA_REQUIRED_MSG,
      status: 400,
    };
  }

  return { ok: true };
}
