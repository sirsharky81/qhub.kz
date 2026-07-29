import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { getWhitelistEntry } from "@/lib/messenger/store";
import { createPeer, listPeersForPhone } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";
import { getVpnServerConfig } from "@/lib/vpn/env";
import { buildClientConfig } from "@/lib/vpn/wireguard";

async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")
    ? normalizeKzPhone(url.searchParams.get("phone") ?? "")
    : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Укажите phone=+7…" }, { status: 400 });
  }

  const entry = await getWhitelistEntry(phone);
  if (!entry || entry.status !== "active" || !entry.vpnEnabled) {
    return NextResponse.json({ error: "VPN не включён для этого номера" }, { status: 400 });
  }

  const peers = await listPeersForPhone(phone);
  return NextResponse.json({ ok: true, peers });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { phone?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  const entry = await getWhitelistEntry(phone);
  if (!entry || entry.status !== "active" || !entry.vpnEnabled) {
    return NextResponse.json({ error: "Сначала включите VPN для номера" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label : "Устройство";
  try {
    const peer = await createPeer({ phone, label });
    const sync = await triggerVpnSync();

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
      peer: {
        id: peer.id,
        label: peer.label,
        address: peer.address,
        createdAt: peer.createdAt,
        status: peer.status,
      },
      config,
      filename: `qhub-vpn-${peer.label.replace(/\s+/g, "-").toLowerCase()}.conf`,
      syncOk: sync.ok,
      syncError: sync.ok ? undefined : sync.error,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "vpn_peer_limit_reached") {
      return NextResponse.json({ error: "Максимум 5 устройств на номер" }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось создать конфиг" }, { status: 500 });
  }
}
