import { getAmneziaPeerById } from "./amnezia-store";
import { getPeerById } from "./store";
import type { AmneziaPeer, VpnPeer } from "./types";

export type ResolvedVpnPeer =
  | { protocol: "wireguard"; peer: VpnPeer }
  | { protocol: "amnezia"; peer: AmneziaPeer };

export async function resolveActivePeer(
  peerId: string,
  phone: string,
): Promise<ResolvedVpnPeer | null> {
  const wg = await getPeerById(peerId);
  if (wg && wg.phone === phone && wg.status === "active") {
    return { protocol: "wireguard", peer: wg };
  }
  const amnezia = await getAmneziaPeerById(peerId);
  if (amnezia && amnezia.phone === phone && amnezia.status === "active") {
    return { protocol: "amnezia", peer: amnezia };
  }
  return null;
}
