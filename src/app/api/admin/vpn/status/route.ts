import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getAmneziaLiveStatus } from "@/lib/vpn/amnezia";
import { getAmneziaStoreStats } from "@/lib/vpn/amnezia-store";
import {
  getAmneziaServerConfig,
  getVpnServerConfig,
  isAmneziaConfigured,
  isVpnServerConfigured,
} from "@/lib/vpn/env";
import { getWireGuardLiveStatus } from "@/lib/vpn/server-status";
import { getVpnStoreStats } from "@/lib/vpn/store";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stats = await getVpnStoreStats();
  const amneziaStats = await getAmneziaStoreStats();
  const server = getVpnServerConfig();
  const amnezia = getAmneziaServerConfig();
  const live = await getWireGuardLiveStatus();
  const amneziaLive = await getAmneziaLiveStatus();

  const configPort = server.endpoint.includes(":")
    ? Number.parseInt(server.endpoint.split(":").pop() ?? "", 10)
    : null;

  const amneziaConfigPort = amnezia.endpoint.includes(":")
    ? Number.parseInt(amnezia.endpoint.split(":").pop() ?? "", 10)
    : null;

  return NextResponse.json({
    configured: isVpnServerConfigured(),
    enabled: server.enabled,
    endpoint: server.endpoint || null,
    liveListenPort: live.listenPort,
    livePeerCount: live.peerCount,
    portMismatch:
      live.listenPort != null &&
      configPort != null &&
      Number.isFinite(configPort) &&
      live.listenPort !== configPort,
    syncCommandSet: Boolean(server.syncCommand),
    amneziaConfigured: isAmneziaConfigured(),
    amneziaEnabled: amnezia.enabled,
    amneziaEndpoint: amnezia.endpoint || null,
    amneziaRunning: amneziaLive.running,
    amneziaListenPort: amneziaLive.listenPort,
    amneziaLivePeerCount: amneziaLive.peerCount,
    amneziaPortMismatch:
      amneziaLive.listenPort != null &&
      amneziaConfigPort != null &&
      Number.isFinite(amneziaConfigPort) &&
      amneziaLive.listenPort !== amneziaConfigPort,
    amneziaPortalPeers: amneziaStats.activePeers,
    ...stats,
    activePeers: stats.activePeers + amneziaStats.activePeers,
  });
}
