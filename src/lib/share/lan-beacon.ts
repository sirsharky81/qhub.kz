import { shareRedisDel, shareRedisGetJson, shareRedisSet } from "./redis";

const BEACON_TTL_SEC = 45;
const BEACON_PREFIX = "share:lan:";

function subnetKey(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  if (ip.includes(":")) {
    const segs = ip.split(":");
    return segs.slice(0, 4).join(":");
  }
  return ip;
}

function beaconKey(subnet: string, roomId: string): string {
  return `${BEACON_PREFIX}${subnet}:${roomId}`;
}

export interface LanBeacon {
  roomId: string;
  roomCode: string;
  deviceName: string;
  subnet: string;
  updatedAt: number;
}

export async function registerLanBeacon(input: {
  clientIp: string;
  roomId: string;
  roomCode: string;
  deviceName: string;
}): Promise<void> {
  const subnet = subnetKey(input.clientIp);
  const beacon: LanBeacon = {
    roomId: input.roomId,
    roomCode: input.roomCode,
    deviceName: input.deviceName,
    subnet,
    updatedAt: Date.now(),
  };
  await shareRedisSet(beaconKey(subnet, input.roomId), JSON.stringify(beacon), BEACON_TTL_SEC);
}

export async function listNearbyBeacons(clientIp: string): Promise<LanBeacon[]> {
  // Memory/redis scan: keys are per-room; we don't have KEYS in memory fallback easily.
  // Store subnet index key with JSON array of roomIds.
  const subnet = subnetKey(clientIp);
  const indexKey = `${BEACON_PREFIX}index:${subnet}`;
  const roomIds = (await shareRedisGetJson<string[]>(indexKey)) ?? [];
  const out: LanBeacon[] = [];
  for (const roomId of roomIds) {
    const raw = await shareRedisGetJson<LanBeacon>(beaconKey(subnet, roomId));
    if (raw && Date.now() - raw.updatedAt < BEACON_TTL_SEC * 1000) {
      out.push(raw);
    }
  }
  return out;
}

export async function registerLanBeaconIndexed(input: {
  clientIp: string;
  roomId: string;
  roomCode: string;
  deviceName: string;
}): Promise<void> {
  const subnet = subnetKey(input.clientIp);
  await registerLanBeacon(input);
  const indexKey = `${BEACON_PREFIX}index:${subnet}`;
  const existing = (await shareRedisGetJson<string[]>(indexKey)) ?? [];
  const next = [...new Set([...existing, input.roomId])].slice(-20);
  await shareRedisSet(indexKey, JSON.stringify(next), BEACON_TTL_SEC);
}

export async function clearLanBeacon(clientIp: string, roomId: string): Promise<void> {
  const subnet = subnetKey(clientIp);
  await shareRedisDel(beaconKey(subnet, roomId));
}
