import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getVpnServerConfig, isVpnServerConfigured } from "@/lib/vpn/env";
import { getWireGuardLiveStatus } from "@/lib/vpn/server-status";
import { getVpnStoreStats } from "@/lib/vpn/store";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stats = await getVpnStoreStats();
  const server = getVpnServerConfig();
  const live = await getWireGuardLiveStatus();

  const configPort = server.endpoint.includes(":")
    ? Number.parseInt(server.endpoint.split(":").pop() ?? "", 10)
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
    ...stats,
  });
}
