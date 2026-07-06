import { Redis } from "@upstash/redis";
import { cleanEnv } from "./env";

let client: Redis | null | undefined;

export function getUpstashClient(): Redis | null {
  if (client !== undefined) return client;
  const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) {
    client = null;
    return null;
  }
  client = new Redis({ url, token });
  return client;
}
