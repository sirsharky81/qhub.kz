import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { amneziaExportClient } from "@/lib/vpn/amnezia";
import { getVpnServerConfig } from "@/lib/vpn/env";
import { resolveActivePeer } from "@/lib/vpn/resolve-peer";
import { buildClientConfig } from "@/lib/vpn/wireguard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ peerId: string }> },
) {
  try {
    const { phone } = await assertVpnAccess();
    const { peerId } = await context.params;
    const resolved = await resolveActivePeer(peerId, phone);
    if (!resolved) {
      return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    }

    if (resolved.protocol === "amnezia") {
      const files = await amneziaExportClient(resolved.peer.amneziaName);
      const qrPayload = files.vpnUri || files.config || "";
      if (!qrPayload) {
        return NextResponse.json({ error: "Нет данных для QR" }, { status: 500 });
      }
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 280 });
      return NextResponse.json({
        ok: true,
        protocol: "amnezia",
        qrDataUrl,
        vpnUri: files.vpnUri,
        config: files.config,
      });
    }

    const server = getVpnServerConfig();
    const config = buildClientConfig({
      privateKey: resolved.peer.privateKey,
      address: resolved.peer.address,
      dns: server.dns,
      serverPublicKey: server.serverPublicKey,
      endpoint: server.endpoint,
    });
    const qrDataUrl = await QRCode.toDataURL(config, { margin: 1, width: 280 });

    return NextResponse.json({ ok: true, protocol: "wireguard", qrDataUrl, config });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
