import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getAdminEmail } from "@/lib/admin/session";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { loadWhitelist, saveWhitelist } from "@/lib/messenger/store";
import type { WhitelistEntry, WhitelistStatus } from "@/lib/messenger/types";
import { revokeAllAmneziaPeersForPhone } from "@/lib/vpn/amnezia-store";
import { revokeAllPeersForPhone } from "@/lib/vpn/store";
import { triggerVpnSync } from "@/lib/vpn/sync";

async function revokeAllVpnDevices(phone: string): Promise<void> {
  await Promise.all([revokeAllPeersForPhone(phone), revokeAllAmneziaPeersForPhone(phone)]);
  await triggerVpnSync();
}

async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const whitelist = await loadWhitelist();
  const entries = Object.values(whitelist).sort((a, b) => b.addedAt - a.addedAt);
  return NextResponse.json({ entries });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { phone?: string; status?: WhitelistStatus; vpnEnabled?: boolean; musicEnabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  const whitelist = await loadWhitelist();

  if (body.status === "revoked") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    whitelist[phone] = { ...existing, status: "revoked", vpnEnabled: false, musicEnabled: false };
    await saveWhitelist(whitelist);
    await revokeAllVpnDevices(phone);
    return NextResponse.json({ ok: true, entry: whitelist[phone] });
  }

  if (body.status === "active") {
    const existing = whitelist[phone];
    if (existing) {
      whitelist[phone] = { ...existing, status: "active" };
    } else {
      return NextResponse.json({ error: "Используйте POST для добавления" }, { status: 400 });
    }
    await saveWhitelist(whitelist);
    return NextResponse.json({ ok: true, entry: whitelist[phone] });
  }

  if (typeof body.vpnEnabled === "boolean") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    if (existing.status !== "active") {
      return NextResponse.json({ error: "Сначала активируйте номер в whitelist" }, { status: 400 });
    }
    whitelist[phone] = { ...existing, vpnEnabled: body.vpnEnabled };
    await saveWhitelist(whitelist);
    if (!body.vpnEnabled) {
      await revokeAllVpnDevices(phone);
    }
    return NextResponse.json({ ok: true, entry: whitelist[phone] });
  }

  if (typeof body.musicEnabled === "boolean") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    if (existing.status !== "active") {
      return NextResponse.json({ error: "Сначала активируйте номер в whitelist" }, { status: 400 });
    }
    whitelist[phone] = { ...existing, musicEnabled: body.musicEnabled };
    await saveWhitelist(whitelist);
    return NextResponse.json({ ok: true, entry: whitelist[phone] });
  }

  return NextResponse.json({ error: "Укажите status" }, { status: 400 });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  const whitelist = await loadWhitelist();
  const entry: WhitelistEntry = {
    phone,
    addedBy: getAdminEmail(),
    addedAt: Date.now(),
    status: "active",
  };
  whitelist[phone] = entry;
  await saveWhitelist(whitelist);
  return NextResponse.json({ ok: true, entry });
}
