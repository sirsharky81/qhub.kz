import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { setMessengerGlobalPresence } from "@/lib/messenger/push-store";

export async function POST() {
  try {
    const { phone } = await assertMessengerSession();
    await setMessengerGlobalPresence(phone);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
