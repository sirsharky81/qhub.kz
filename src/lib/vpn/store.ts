import { randomUUID } from "node:crypto";
import { redisGet, redisGetJson, redisSet } from "@/lib/redis/commands";
import { getWhitelistEntry } from "@/lib/messenger/store";
import {
  REDIS_VPN_NEXT_IP_KEY,
  REDIS_VPN_PEERS_KEY,
  VPN_IP_POOL_END,
  VPN_IP_POOL_START,
  VPN_NETWORK_PREFIX,
} from "./constants";
import { generateWireGuardKeyPair } from "./wireguard";
import type { VpnPeer, VpnPeerPublic, VpnPeerStatus } from "./types";

type PeerIndex = Record<string, VpnPeer>;

let peersCache: { at: number; data: PeerIndex } | null = null;
const PEERS_CACHE_TTL_MS = 15_000;

function toPublicPeer(peer: VpnPeer): VpnPeerPublic {
  return {
    id: peer.id,
    label: peer.label,
    address: peer.address,
    createdAt: peer.createdAt,
    status: peer.status,
  };
}

async function loadPeerIndex(): Promise<PeerIndex> {
  if (peersCache && Date.now() - peersCache.at < PEERS_CACHE_TTL_MS) {
    return peersCache.data;
  }
  const data = await redisGetJson<PeerIndex>(REDIS_VPN_PEERS_KEY);
  const next = data ?? {};
  peersCache = { at: Date.now(), data: next };
  return next;
}

async function savePeerIndex(data: PeerIndex): Promise<void> {
  await redisSet(REDIS_VPN_PEERS_KEY, JSON.stringify(data));
  peersCache = { at: Date.now(), data };
}

async function allocateClientIp(index: PeerIndex): Promise<string> {
  const used = new Set(
    Object.values(index)
      .filter((peer) => peer.status === "active")
      .map((peer) => peer.address),
  );

  for (let host = VPN_IP_POOL_START; host <= VPN_IP_POOL_END; host += 1) {
    const candidate = `${VPN_NETWORK_PREFIX}.${host}`;
    if (!used.has(candidate)) return candidate;
  }

  const raw = await redisGet(REDIS_VPN_NEXT_IP_KEY);
  let next = raw ? Number.parseInt(raw, 10) : VPN_IP_POOL_START;
  if (!Number.isFinite(next) || next < VPN_IP_POOL_START) next = VPN_IP_POOL_START;

  while (next <= VPN_IP_POOL_END) {
    const candidate = `${VPN_NETWORK_PREFIX}.${next}`;
    next += 1;
    if (!used.has(candidate)) {
      await redisSet(REDIS_VPN_NEXT_IP_KEY, String(next));
      return candidate;
    }
  }

  throw new Error("vpn_ip_pool_exhausted");
}

export async function isVpnEnabledForPhone(phone: string): Promise<boolean> {
  const entry = await getWhitelistEntry(phone);
  return entry?.status === "active" && entry.vpnEnabled === true;
}

export async function listPeersForPhone(phone: string): Promise<VpnPeerPublic[]> {
  const index = await loadPeerIndex();
  return Object.values(index)
    .filter((peer) => peer.phone === phone && peer.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublicPeer);
}

export async function getPeerById(peerId: string): Promise<VpnPeer | null> {
  const index = await loadPeerIndex();
  return index[peerId] ?? null;
}

export async function listActivePeers(): Promise<VpnPeer[]> {
  const index = await loadPeerIndex();
  return Object.values(index).filter((peer) => peer.status === "active");
}

export async function createPeer(input: {
  phone: string;
  label: string;
}): Promise<VpnPeer> {
  const index = await loadPeerIndex();
  const activeForPhone = Object.values(index).filter(
    (peer) => peer.phone === input.phone && peer.status === "active",
  );
  if (activeForPhone.length >= 5) {
    throw new Error("vpn_peer_limit_reached");
  }

  const { privateKey, publicKey } = generateWireGuardKeyPair();
  const address = await allocateClientIp(index);
  const peer: VpnPeer = {
    id: randomUUID(),
    phone: input.phone,
    label: input.label.trim().slice(0, 64) || "Устройство",
    publicKey,
    privateKey,
    address,
    createdAt: Date.now(),
    status: "active",
  };
  index[peer.id] = peer;
  await savePeerIndex(index);
  return peer;
}

export async function revokePeer(peerId: string, phone: string): Promise<VpnPeer | null> {
  const index = await loadPeerIndex();
  const peer = index[peerId];
  if (!peer || peer.phone !== phone) return null;
  if (peer.status === "revoked") return peer;
  peer.status = "revoked";
  peer.revokedAt = Date.now();
  index[peerId] = peer;
  await savePeerIndex(index);
  return peer;
}

export async function revokeAllPeersForPhone(phone: string): Promise<number> {
  const index = await loadPeerIndex();
  let count = 0;
  for (const peer of Object.values(index)) {
    if (peer.phone !== phone || peer.status !== "active") continue;
    peer.status = "revoked";
    peer.revokedAt = Date.now();
    index[peer.id] = peer;
    count += 1;
  }
  if (count > 0) await savePeerIndex(index);
  return count;
}

export function countActivePeers(index: PeerIndex): number {
  return Object.values(index).filter((peer) => peer.status === "active").length;
}

export async function getVpnStoreStats(): Promise<{
  activePeers: number;
  phonesWithPeers: number;
}> {
  const index = await loadPeerIndex();
  const active = Object.values(index).filter((peer) => peer.status === "active");
  return {
    activePeers: active.length,
    phonesWithPeers: new Set(active.map((peer) => peer.phone)).size,
  };
}

export type { VpnPeerStatus };
