import { NextResponse } from "next/server";
import QRCode from "qrcode";
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
    const qrDataUrl = await QRCode.toDataURL(config, { margin: 1, width: 280 });

    return NextResponse.json({ ok: true, qrDataUrl, config });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
