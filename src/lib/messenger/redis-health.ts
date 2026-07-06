import { isRedisConfigured, redisPing } from "@/lib/redis/commands";

export async function assertMessengerRedisReady(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRedisConfigured()) {
    return { ok: false, error: "Хранилище комнат не настроено на сервере (Redis env)." };
  }
  try {
    const ok = await redisPing();
    if (!ok) {
      return { ok: false, error: "Хранилище комнат недоступно (Redis auth/network)." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Хранилище комнат недоступно (Redis auth/network)." };
  }
}
