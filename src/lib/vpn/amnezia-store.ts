import { randomUUID } from "node:crypto";
import { redisGetJson, redisSet } from "@/lib/redis/commands";
import { REDIS_VPN_AMNEZIA_PEERS_KEY } from "./constants";
import {
  amneziaAddClient,
  amneziaRemoveClient,
  buildAmneziaClientName,
} from "./amnezia";
import type { AmneziaPeer, VpnPeerPublic, VpnPeerStatus } from "./types";

type AmneziaPeerIndex = Record<string, AmneziaPeer>;

let cache: { at: number; data: AmneziaPeerIndex } | null = null;
const CACHE_TTL_MS = 15_000;

function toPublicPeer(peer: AmneziaPeer): VpnPeerPublic {
  return {
    id: peer.id,
    label: peer.label,
    protocol: "amnezia",
    address: peer.address,
    createdAt: peer.createdAt,
    status: peer.status,
  };
}

async function loadIndex(): Promise<AmneziaPeerIndex> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  const data = await redisGetJson<AmneziaPeerIndex>(REDIS_VPN_AMNEZIA_PEERS_KEY);
  const next = data ?? {};
  cache = { at: Date.now(), data: next };
  return next;
}

async function saveIndex(data: AmneziaPeerIndex): Promise<void> {
  await redisSet(REDIS_VPN_AMNEZIA_PEERS_KEY, JSON.stringify(data));
  cache = { at: Date.now(), data };
}

export async function listAmneziaPeersForPhone(phone: string): Promise<VpnPeerPublic[]> {
  const index = await loadIndex();
  return Object.values(index)
    .filter((peer) => peer.phone === phone && peer.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublicPeer);
}

export async function getAmneziaPeerById(peerId: string): Promise<AmneziaPeer | null> {
  const index = await loadIndex();
  return index[peerId] ?? null;
}

export async function countActiveAmneziaPeersForPhone(phone: string): Promise<number> {
  const index = await loadIndex();
  return Object.values(index).filter((p) => p.phone === phone && p.status === "active").length;
}

export async function createAmneziaPeer(input: {
  phone: string;
  label: string;
}): Promise<AmneziaPeer> {
  const index = await loadIndex();
  const id = randomUUID();
  const amneziaName = buildAmneziaClientName(id);
  const created = await amneziaAddClient(amneziaName);

  const peer: AmneziaPeer = {
    id,
    phone: input.phone,
    label: input.label.trim().slice(0, 64) || "Устройство",
    amneziaName,
    address: created.address ?? "10.9.9.x",
    createdAt: Date.now(),
    status: "active",
  };
  index[peer.id] = peer;
  await saveIndex(index);
  return peer;
}

export async function revokeAmneziaPeer(peerId: string, phone: string): Promise<AmneziaPeer | null> {
  const index = await loadIndex();
  const peer = index[peerId];
  if (!peer || peer.phone !== phone) return null;
  if (peer.status === "revoked") return peer;

  try {
    await amneziaRemoveClient(peer.amneziaName);
  } catch (error) {
    console.error("[vpn-amnezia] remove failed:", error);
  }

  peer.status = "revoked";
  peer.revokedAt = Date.now();
  index[peerId] = peer;
  await saveIndex(index);
  return peer;
}

export async function revokeAllAmneziaPeersForPhone(phone: string): Promise<number> {
  const index = await loadIndex();
  let count = 0;
  for (const peer of Object.values(index)) {
    if (peer.phone !== phone || peer.status !== "active") continue;
    try {
      await amneziaRemoveClient(peer.amneziaName);
    } catch (error) {
      console.error("[vpn-amnezia] remove failed:", peer.amneziaName, error);
    }
    peer.status = "revoked";
    peer.revokedAt = Date.now();
    index[peer.id] = peer;
    count += 1;
  }
  if (count > 0) await saveIndex(index);
  return count;
}

export async function getAmneziaStoreStats(): Promise<{ activePeers: number }> {
  const index = await loadIndex();
  return {
    activePeers: Object.values(index).filter((p) => p.status === "active").length,
  };
}

export type { VpnPeerStatus };
