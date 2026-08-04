import { NextResponse } from "next/server";
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
      const slug = resolved.peer.label.replace(/\s+/g, "-").toLowerCase();
      return NextResponse.json({
        ok: true,
        protocol: "amnezia",
        config: files.config,
        vpnUri: files.vpnUri,
        label: resolved.peer.label,
        filename: `qhub-amnezia-${slug}.conf`,
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

    return NextResponse.json({
      ok: true,
      protocol: "wireguard",
      config,
      label: resolved.peer.label,
      filename: `qhub-vpn-${resolved.peer.label.replace(/\s+/g, "-").toLowerCase()}.conf`,
    });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
