import { NextResponse } from "next/server";
import { assertVpnAccess, vpnErrorResponse } from "@/lib/vpn/guard";
import { isAmneziaConfigured, isVpnServerConfigured } from "@/lib/vpn/env";
import {
  createAmneziaPeer,
  listAmneziaPeersForPhone,
} from "@/lib/vpn/amnezia-store";
import { createPeer, listPeersForPhone } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";
import type { VpnProtocol } from "@/lib/vpn/types";

const MAX_DEVICES = 5;

async function activeDeviceCount(phone: string): Promise<number> {
  const [wg, amnezia] = await Promise.all([
    listPeersForPhone(phone),
    listAmneziaPeersForPhone(phone),
  ]);
  return wg.length + amnezia.length;
}

export async function GET() {
  try {
    const { phone } = await assertVpnAccess();
    const [wgPeers, amneziaPeers] = await Promise.all([
      listPeersForPhone(phone),
      listAmneziaPeersForPhone(phone),
    ]);
    const peers = [...wgPeers, ...amneziaPeers].sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ ok: true, peers });
  } catch (error) {
    return vpnErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { phone } = await assertVpnAccess();
    let body: { label?: string; protocol?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const label = typeof body.label === "string" ? body.label : "Устройство";
    const protocol: VpnProtocol =
      body.protocol === "amnezia" ? "amnezia" : "wireguard";

    if (protocol === "amnezia" && !isAmneziaConfigured()) {
      return NextResponse.json(
        { error: "AmneziaVPN на сервере не настроен" },
        { status: 503 },
      );
    }
    if (protocol === "wireguard" && !isVpnServerConfigured()) {
      return NextResponse.json(
        { error: "WireGuard на сервере не настроен" },
        { status: 503 },
      );
    }

    if ((await activeDeviceCount(phone)) >= MAX_DEVICES) {
      return NextResponse.json({ error: "Максимум 5 устройств на номер" }, { status: 400 });
    }

    if (protocol === "amnezia") {
      const peer = await createAmneziaPeer({ phone, label });
      return NextResponse.json({
        ok: true,
        peer: {
          id: peer.id,
          label: peer.label,
          protocol: "amnezia" as const,
          address: peer.address,
          createdAt: peer.createdAt,
          status: peer.status,
        },
      });
    }

    const peer = await createPeer({ phone, label });
    const sync = await triggerVpnSync();
    return NextResponse.json({
      ok: true,
      peer: {
        id: peer.id,
        label: peer.label,
        protocol: "wireguard" as const,
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
