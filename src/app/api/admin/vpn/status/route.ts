import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getVpnServerConfig, isVpnServerConfigured } from "@/lib/vpn/env";
import { getVpnStoreStats } from "@/lib/vpn/store";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stats = await getVpnStoreStats();
  const server = getVpnServerConfig();

  return NextResponse.json({
    configured: isVpnServerConfigured(),
    enabled: server.enabled,
    endpoint: server.endpoint || null,
    syncCommandSet: Boolean(server.syncCommand),
    ...stats,
  });
}
