import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getRedisBackend } from "@/lib/redis/env";
import { cleanEnv } from "@/lib/redis/env";
import { getTcpClient } from "@/lib/redis/tcp";

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
  "qhub:messenger-call-signal": { requests: 800, window: "1 m" },
  "qhub:messenger-call-poll": { requests: 900, window: "1 m" },
  "qhub:messenger-identify-phone": { requests: 10, window: "15 m" },
  "qhub:family": { requests: 120, window: "1 m" },
  "qhub:share": { requests: 60, window: "1 m" },
  "qhub:share-signal": { requests: 800, window: "1 m" },
  "qhub:share-poll": { requests: 900, window: "1 m" },
  "qhub:family-loc-req-notify": { requests: 1, window: "45 s" },
  "qhub:family-loc-req-silent": { requests: 1, window: "10 s" },
  "qhub:kz-maps-suggest": { requests: 5, window: "15 m" },
  "qhub:mail-passwd": { requests: 10, window: "1 h" },
  "qhub:send": { requests: 30, window: "1 m" },
  "qhub:send-upload": { requests: 10, window: "1 h" },
  "qhub:send-download": { requests: 120, window: "1 m" },
};

let ratelimitCache: Map<string, Ratelimit | null> | undefined;

function parseWindowMs(window: RateWindow): number {
  const [amountRaw, unit] = window.split(" ");
  const amount = Number(amountRaw);
  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return amount * 60 * 1000;
  }
}

function getUpstashRatelimit(prefix: string): Ratelimit | null {
  if (!ratelimitCache) ratelimitCache = new Map();
  if (ratelimitCache.has(prefix)) return ratelimitCache.get(prefix) ?? null;

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

async function checkTcpRateLimit(
  prefix: string,
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const client = getTcpClient();
  if (!client) return { allowed: true };

  const config = RATE_LIMIT_CONFIGS[prefix] ?? { requests: 5, window: "15 m" as RateWindow };
  const windowMs = parseWindowMs(config.window);
  const now = Date.now();
  const key = `${prefix}:rl:${identifier}`;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  const results = await client
    .multi()
    .zremrangebyscore(key, 0, now - windowMs)
    .zadd(key, now, member)
    .zcard(key)
    .pexpire(key, windowMs)
    .exec();

  const count = Number(results?.[2]?.[1] ?? 0);
  if (count <= config.requests) return { allowed: true };

  await client.zrem(key, member);
  const oldest = await client.zrange(key, 0, 0, "WITHSCORES");
  const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;
  const retryAfterSec = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));
  return { allowed: false, retryAfterSec };
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
  const backend = getRedisBackend();
  if (!backend) return { allowed: true };

  if (backend === "tcp") {
    try {
      return await checkTcpRateLimit(prefix, identifier);
    } catch (err) {
      console.error("[rate-limit] TCP check failed, allowing request:", err);
      return { allowed: true };
    }
  }

  const ratelimit = getUpstashRatelimit(prefix);
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

export async function checkSplitRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:split", identifier);
}

export async function checkShareRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:share", identifier);
}

export async function checkShareSignalRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:share-signal", identifier);
}

export async function checkSharePollRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:share-poll", identifier);
}

export async function checkFamilyLocationRequestRateLimit(
  parentMemberId: string,
  targetMemberId: string,
  mode: "silent" | "notify" = "notify",
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const prefix =
    mode === "silent" ? "qhub:family-loc-req-silent" : "qhub:family-loc-req-notify";
  return checkRateLimit(prefix, `${parentMemberId}:${targetMemberId}`);
}

export async function checkKzMapsSuggestRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:kz-maps-suggest", identifier);
}

export async function checkSendRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:send", identifier);
}

export async function checkSendUploadRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:send-upload", identifier);
}

export async function checkSendDownloadRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  return checkRateLimit("qhub:send-download", identifier);
}
