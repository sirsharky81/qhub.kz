import { NextResponse } from "next/server";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { getVpnServerConfig } from "@/lib/vpn/env";
import { getPeerById } from "@/lib/vpn/store";
import { buildClientConfig } from "@/lib/vpn/wireguard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ peerId: string }> },
) {
  try {
    const { phone } = await assertVpnAccess();
    const { peerId } = await context.params;
    const peer = await getPeerById(peerId);
    if (!peer || peer.phone !== phone || peer.status !== "active") {
      return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    }

    const server = getVpnServerConfig();
    const config = buildClientConfig({
      privateKey: peer.privateKey,
      address: peer.address,
      dns: server.dns,
      serverPublicKey: server.serverPublicKey,
      endpoint: server.endpoint,
    });

    return NextResponse.json({
      ok: true,
      config,
      label: peer.label,
      filename: `qhub-vpn-${peer.label.replace(/\s+/g, "-").toLowerCase()}.conf`,
    });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
