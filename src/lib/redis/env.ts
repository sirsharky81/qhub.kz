export function cleanEnv(value: string | undefined): string | undefined {
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

export type RedisBackend = "tcp" | "upstash";

export function getRedisBackend(): RedisBackend | null {
  if (cleanEnv(process.env.REDIS_URL)) return "tcp";
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (url && token) return "upstash";
  return null;
}

export function isRedisConfigured(): boolean {
  return getRedisBackend() !== null;
}
