import { NextResponse } from "next/server";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { createPeer, listPeersForPhone } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";

export async function GET() {
  try {
    const { phone } = await assertVpnAccess();
    const peers = await listPeersForPhone(phone);
    return NextResponse.json({ ok: true, peers });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { phone } = await assertVpnAccess();
    let body: { label?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const label = typeof body.label === "string" ? body.label : "Устройство";
    const peer = await createPeer({ phone, label });
    const sync = await triggerVpnSync();
    return NextResponse.json({
      ok: true,
      peer: {
        id: peer.id,
        label: peer.label,
        address: peer.address,
        createdAt: peer.createdAt,
        status: peer.status,
      },
      syncOk: sync.ok,
      syncWarning: sync.ok ? undefined : sync.error,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "vpn_peer_limit_reached") {
      return NextResponse.json({ error: "Максимум 5 устройств на номер" }, { status: 400 });
    }
    return vpnErrorResponse(error);
  }
}
