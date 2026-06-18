import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ideasRatelimit: Ratelimit | null | undefined;

function getIdeasRatelimit(): Ratelimit | null {
  if (ideasRatelimit !== undefined) return ideasRatelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    ideasRatelimit = null;
    return null;
  }

  ideasRatelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "qhub:ideas",
  });

  return ideasRatelimit;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function checkIdeasRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const ratelimit = getIdeasRatelimit();
  if (!ratelimit) return { allowed: true };

  const { success, reset } = await ratelimit.limit(identifier);
  if (success) return { allowed: true };

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { allowed: false, retryAfterSec };
}
