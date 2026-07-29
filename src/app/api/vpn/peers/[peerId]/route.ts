import { NextResponse } from "next/server";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { getPeerById, revokePeer } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ peerId: string }> },
) {
  try {
    const { phone } = await assertVpnAccess();
    const { peerId } = await context.params;
    const peer = await revokePeer(peerId, phone);
    if (!peer) {
      return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    }
    await triggerVpnSync();
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
    const peer = await getPeerById(peerId);
    if (!peer || peer.phone !== phone || peer.status !== "active") {
      return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      peer: {
        id: peer.id,
        label: peer.label,
        address: peer.address,
        createdAt: peer.createdAt,
        status: peer.status,
      },
    });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}
