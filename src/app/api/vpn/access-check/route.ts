import { NextResponse } from "next/server";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted, getWhitelistEntry } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { isVpnServerConfigured } from "@/lib/vpn/env";
import { listPeersForPhone } from "@/lib/vpn/store";

export async function GET() {
  try {
    const configured = isVpnServerConfigured();
    const session = await getMessengerSession();
    if (!session) {
      return NextResponse.json({
        allowed: false,
        vpnEnabled: false,
        messengerLoggedIn: false,
        configured,
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
      });
    }

    const entry = await getWhitelistEntry(phone);
    const vpnEnabled = entry?.vpnEnabled === true;
    const peers = vpnEnabled ? await listPeersForPhone(phone) : [];

    return NextResponse.json({
      allowed: configured && vpnEnabled,
      vpnEnabled,
      messengerLoggedIn: true,
      configured,
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
        error: "vpn_backend_unavailable",
      },
      { status: 503 },
    );
  }
}
