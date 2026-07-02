import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateWindow = `${number} ${"s" | "m" | "h" | "d"}`;

interface RateLimitConfig {
  requests: number;
  window: RateWindow;
}

const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  "qhub:ideas": { requests: 5, window: "15 m" },
  "qhub:developers": { requests: 5, window: "15 m" },
  "qhub:audio-extractor": { requests: 10, window: "1 h" },
  "qhub:lotto": { requests: 120, window: "1 m" },
  "qhub:messenger": { requests: 60, window: "1 m" },
  "qhub:messenger-call-signal": { requests: 400, window: "1 m" },
  "qhub:messenger-call-poll": { requests: 900, window: "1 m" },
  "qhub:messenger-identify-phone": { requests: 10, window: "15 m" },
  "qhub:family": { requests: 120, window: "1 m" },
};

let ratelimitCache: Map<string, Ratelimit | null> | undefined;

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getRatelimit(prefix: string): Ratelimit | null {
  if (!ratelimitCache) ratelimitCache = new Map();

  if (ratelimitCache.has(prefix)) {
    return ratelimitCache.get(prefix) ?? null;
  }

  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) {
    ratelimitCache.set(prefix, null);
    return null;
  }

  const config = RATE_LIMIT_CONFIGS[prefix] ?? { requests: 5, window: "15 m" as RateWindow };

  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix,
  });

  ratelimitCache.set(prefix, limiter);
  return limiter;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit(
  prefix: string,
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const ratelimit = getRatelimit(prefix);
  if (!ratelimit) return { allowed: true };

  try {
    const { success, reset } = await ratelimit.limit(identifier);
    if (success) return { allowed: true };

    const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { allowed: false, retryAfterSec };
  } catch (err) {
    console.error("[rate-limit] Upstash check failed, allowing request:", err);
    return { allowed: true };
  }
}

export async function checkIdeasRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:ideas", identifier);
}

export async function checkDevelopersRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:developers", identifier);
}

export async function checkAudioExtractorRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:audio-extractor", identifier);
}

export async function checkLottoRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:lotto", identifier);
}

export async function checkMessengerRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:messenger", identifier);
}

export async function checkMessengerCallSignalRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:messenger-call-signal", identifier);
}

export async function checkMessengerCallPollRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:messenger-call-poll", identifier);
}

export async function checkMessengerIdentifyPhoneRateLimit(
  phone: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:messenger-identify-phone", phone);
}

export async function checkFamilyRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:family", identifier);
}
