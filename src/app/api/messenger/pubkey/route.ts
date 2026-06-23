import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { getPublicKey, setPublicKey } from "@/lib/messenger/store";

export async function GET(request: Request) {
  try {
    await assertMessengerSession();
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone");
    if (!phone || !isValidKzPhone(phone)) {
      return NextResponse.json({ error: "Укажите phone" }, { status: 400 });
    }
    const normalized = normalizeKzPhone(phone);
    const publicKey = await getPublicKey(normalized);
    if (!publicKey) {
      return NextResponse.json({ error: "Ключ не найден" }, { status: 404 });
    }
    return NextResponse.json({ phone: normalized, publicKey });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    let body: { publicKey?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }
    const publicKey = typeof body.publicKey === "string" ? body.publicKey.trim() : "";
    if (!publicKey) {
      return NextResponse.json({ error: "Укажите publicKey" }, { status: 400 });
    }
    try {
      JSON.parse(publicKey);
    } catch {
      return NextResponse.json({ error: "Неверный JWK" }, { status: 400 });
    }
    // Intentionally public — ECDH public keys are not secret.
    await setPublicKey(phone, publicKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
