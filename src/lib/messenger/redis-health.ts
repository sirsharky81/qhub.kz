import { getMessengerRedis } from "./redis";

export async function assertMessengerRedisReady(): Promise<{ ok: true } | { ok: false; error: string }> {
  const redis = getMessengerRedis();
  if (!redis) {
    return { ok: false, error: "Хранилище комнат не настроено на сервере (Redis env)." };
  }
  try {
    // Lightweight liveness/auth probe
    await redis.get("qhub:messenger:healthcheck");
    return { ok: true };
  } catch {
    return { ok: false, error: "Хранилище комнат недоступно (Redis auth/network)." };
  }
}
