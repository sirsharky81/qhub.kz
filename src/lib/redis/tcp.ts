import Redis from "ioredis";
import { cleanEnv } from "./env";

let client: Redis | null | undefined;

export function getTcpClient(): Redis | null {
  const url = cleanEnv(process.env.REDIS_URL);
  if (!url) {
    client = null;
    return null;
  }
  if (client === undefined) {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return client;
}

export function serializeTcpValue(raw: string | Buffer | null): string | null {
  if (raw == null) return null;
  return typeof raw === "string" ? raw : raw.toString("utf8");
}
