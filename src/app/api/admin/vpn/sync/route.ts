import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { triggerVpnSync } from "@/lib/vpn/sync";
import { getVpnStoreStats } from "@/lib/vpn/store";

export async function POST() {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sync = await triggerVpnSync();
  const stats = await getVpnStoreStats();

  if (!sync.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: sync.error,
        activePeers: stats.activePeers,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    activePeers: stats.activePeers,
  });
}
