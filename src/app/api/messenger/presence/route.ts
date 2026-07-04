import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { touchMessengerPresence } from "@/lib/messenger/push-store";

export async function POST() {
  try {
    const { phone } = await assertMessengerSession();
    await touchMessengerPresence(phone);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
