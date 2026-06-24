import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { displayNameForPhone, loadProfiles, loadWhitelist } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const whitelist = await loadWhitelist();
    const profiles = await loadProfiles();
    const contacts = Object.values(whitelist)
      .filter((e) => e.status === "active" && e.phone !== phone)
      .map((e) => {
        const p = normalizeKzPhone(e.phone);
        return {
          phone: p,
          displayName: profiles[p]?.displayName ?? null,
          label: displayNameForPhone(p, profiles),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return NextResponse.json({ contacts });
  } catch (err) {
    return jsonAuthError(err);
  }
}
