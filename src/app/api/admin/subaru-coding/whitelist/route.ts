import { NextResponse } from "next/server";
import { getAdminEmail, isAdminAuthenticated } from "@/lib/admin/session";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import {
  loadSubaruCodingWhitelist,
  removeSubaruCodingWhitelistEntry,
  saveSubaruCodingWhitelist,
  type SubaruCodingAccessStatus,
  type SubaruCodingWhitelistEntry,
} from "@/lib/subaru-coding/access";

async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const whitelist = await loadSubaruCodingWhitelist();
  const entries = Object.values(whitelist).sort((a, b) => b.addedAt - a.addedAt);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { phone?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  const whitelist = await loadSubaruCodingWhitelist();
  const existing = whitelist[phone];
  const entry: SubaruCodingWhitelistEntry = {
    phone,
    addedBy: existing?.addedBy ?? getAdminEmail(),
    addedAt: existing?.addedAt ?? Date.now(),
    status: "active",
    note: typeof body.note === "string" ? body.note.trim().slice(0, 120) : (existing?.note ?? ""),
  };
  whitelist[phone] = entry;
  await saveSubaruCodingWhitelist(whitelist);
  return NextResponse.json({ ok: true, entry });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { phone?: string; status?: SubaruCodingAccessStatus; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  const whitelist = await loadSubaruCodingWhitelist();
  const existing = whitelist[phone];
  if (!existing) {
    return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
  }
  if (body.status !== "active" && body.status !== "blocked") {
    return NextResponse.json({ error: "Укажите status" }, { status: 400 });
  }
  const entry: SubaruCodingWhitelistEntry = {
    ...existing,
    status: body.status,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 120) : existing.note,
  };
  whitelist[phone] = entry;
  await saveSubaruCodingWhitelist(whitelist);
  return NextResponse.json({ ok: true, entry });
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

  const removed = await removeSubaruCodingWhitelistEntry(phone);
  if (!removed) {
    return NextResponse.json({ error: "Номер не найден" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
