import { NextResponse } from "next/server";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { revokeAmneziaPeer } from "@/lib/vpn/amnezia-store";
import { resolveActivePeer } from "@/lib/vpn/resolve-peer";
import { revokePeer } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";

export async function DELETE(
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
      await revokeAmneziaPeer(peerId, phone);
    } else {
      await revokePeer(peerId, phone);
      await triggerVpnSync();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}

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

    const peer = resolved.peer;
    return NextResponse.json({
      ok: true,
      peer: {
        id: peer.id,
        label: peer.label,
        protocol: resolved.protocol,
        address: peer.address,
        createdAt: peer.createdAt,
        status: peer.status,
      },
    });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
