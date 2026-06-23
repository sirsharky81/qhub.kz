import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { loadWhitelist } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const whitelist = await loadWhitelist();
    const contacts = Object.values(whitelist)
      .filter((e) => e.status === "active" && e.phone !== phone)
      .map((e) => ({ phone: normalizeKzPhone(e.phone) }))
      .sort((a, b) => a.phone.localeCompare(b.phone));
    return NextResponse.json({ contacts });
  } catch (err) {
    return jsonAuthError(err);
  }
}
