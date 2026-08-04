import { NextResponse } from "next/server";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted, getWhitelistEntry } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import {
  isAmneziaConfigured,
  isAnyVpnBackendConfigured,
  isVpnServerConfigured,
} from "@/lib/vpn/env";
import { listAmneziaPeersForPhone } from "@/lib/vpn/amnezia-store";
import { listPeersForPhone } from "@/lib/vpn/store";

export async function GET() {
  try {
    const wireguardConfigured = isVpnServerConfigured();
    const amneziaConfigured = isAmneziaConfigured();
    const configured = isAnyVpnBackendConfigured();
    const session = await getMessengerSession();
    if (!session) {
      return NextResponse.json({
        allowed: false,
        vpnEnabled: false,
        messengerLoggedIn: false,
        configured,
        wireguardConfigured,
        amneziaConfigured,
      });
    }

    const phone = normalizeKzPhone(session.phone);
    const whitelisted = await isPhoneWhitelisted(phone);
    if (!whitelisted) {
      return NextResponse.json({
        allowed: false,
        vpnEnabled: false,
        messengerLoggedIn: false,
        configured,
        wireguardConfigured,
        amneziaConfigured,
      });
    }

    const entry = await getWhitelistEntry(phone);
    const vpnEnabled = entry?.vpnEnabled === true;
    const [wgPeers, amneziaPeers] = vpnEnabled
      ? await Promise.all([listPeersForPhone(phone), listAmneziaPeersForPhone(phone)])
      : [[], []];
    const peers = [...wgPeers, ...amneziaPeers].sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      allowed: configured && vpnEnabled,
      vpnEnabled,
      messengerLoggedIn: true,
      configured,
      wireguardConfigured,
      amneziaConfigured,
      phone,
      peers,
    });
  } catch {
    return NextResponse.json(
      {
        allowed: false,
        vpnEnabled: false,
        messengerLoggedIn: false,
        configured: false,
        wireguardConfigured: false,
        amneziaConfigured: false,
        error: "vpn_backend_unavailable",
      },
      { status: 503 },
    );
  }
}
