import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getAdminEmail } from "@/lib/admin/session";
import {
  isMessengerVerified,
  isWhitelistActive,
  isWhitelistBlocked,
  messengerOrigin,
  publicWhitelistStatus,
} from "@/lib/messenger/access-status";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import {
  getAuthRecord,
  loadProfiles,
  loadWhitelist,
  removeWhitelistEntry,
  resetAuthPin,
  saveWhitelist,
} from "@/lib/messenger/store";
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

function serializeEntry(
  entry: WhitelistEntry,
  extra: { displayName?: string | null; pinSet?: boolean } = {},
) {
  return {
    ...entry,
    status: publicWhitelistStatus(entry.status),
    verified: isMessengerVerified(entry),
    origin: messengerOrigin(entry),
    displayName: extra.displayName ?? null,
    pinSet: extra.pinSet ?? false,
  };
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [whitelist, profiles] = await Promise.all([loadWhitelist(), loadProfiles()]);
  const entries = await Promise.all(
    Object.values(whitelist)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(async (entry) => {
        const auth = await getAuthRecord(entry.phone);
        return serializeEntry(entry, {
          displayName: profiles[entry.phone]?.displayName ?? null,
          pinSet: Boolean(auth?.pinHash),
        });
      }),
  );
  return NextResponse.json({ entries });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    phone?: string;
    status?: WhitelistStatus;
    vpnEnabled?: boolean;
    musicEnabled?: boolean;
    sendEnabled?: boolean;
  };
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

  if (isWhitelistBlocked(body.status)) {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    whitelist[phone] = {
      ...existing,
      status: "blocked",
      vpnEnabled: false,
      musicEnabled: false,
      sendEnabled: false,
    };
    await saveWhitelist(whitelist);
    await revokeAllVpnDevices(phone);
    return NextResponse.json({ ok: true, entry: serializeEntry(whitelist[phone]) });
  }

  if (body.status === "active") {
    const existing = whitelist[phone];
    if (existing) {
      whitelist[phone] = { ...existing, status: "active" };
    } else {
      return NextResponse.json({ error: "Используйте POST для добавления" }, { status: 400 });
    }
    await saveWhitelist(whitelist);
    return NextResponse.json({ ok: true, entry: serializeEntry(whitelist[phone]) });
  }

  if (typeof body.vpnEnabled === "boolean") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    if (!isWhitelistActive(existing.status)) {
      return NextResponse.json({ error: "Сначала активируйте номер" }, { status: 400 });
    }
    whitelist[phone] = { ...existing, vpnEnabled: body.vpnEnabled };
    await saveWhitelist(whitelist);
    if (!body.vpnEnabled) {
      await revokeAllVpnDevices(phone);
    }
    return NextResponse.json({ ok: true, entry: serializeEntry(whitelist[phone]) });
  }

  if (typeof body.musicEnabled === "boolean") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    if (!isWhitelistActive(existing.status)) {
      return NextResponse.json({ error: "Сначала активируйте номер" }, { status: 400 });
    }
    whitelist[phone] = { ...existing, musicEnabled: body.musicEnabled };
    await saveWhitelist(whitelist);
    return NextResponse.json({ ok: true, entry: serializeEntry(whitelist[phone]) });
  }

  if (typeof body.sendEnabled === "boolean") {
    const existing = whitelist[phone];
    if (!existing) {
      return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
    }
    if (!isWhitelistActive(existing.status)) {
      return NextResponse.json({ error: "Сначала активируйте номер" }, { status: 400 });
    }
    whitelist[phone] = { ...existing, sendEnabled: body.sendEnabled };
    await saveWhitelist(whitelist);
    return NextResponse.json({ ok: true, entry: serializeEntry(whitelist[phone]) });
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
  const existing = whitelist[phone];
  const entry: WhitelistEntry = {
    phone,
    addedBy: existing?.addedBy ?? getAdminEmail(),
    addedAt: existing?.addedAt ?? Date.now(),
    status: "active",
    verified: existing?.verified ?? false,
    verifiedAt: existing?.verifiedAt ?? null,
    vpnEnabled: existing?.vpnEnabled ?? false,
    musicEnabled: existing?.musicEnabled ?? false,
    sendEnabled: existing?.sendEnabled ?? false,
  };
  if (!existing) {
    entry.addedBy = getAdminEmail();
    entry.verified = false;
    entry.verifiedAt = null;
  }
  whitelist[phone] = entry;
  await saveWhitelist(whitelist);
  return NextResponse.json({ ok: true, entry: serializeEntry(entry) });
}

export async function DELETE(request: Request) {
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

  const removed = await removeWhitelistEntry(phone);
  if (!removed) {
    return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
  }
  await resetAuthPin(phone);
  await revokeAllVpnDevices(phone);
  return NextResponse.json({ ok: true });
}
