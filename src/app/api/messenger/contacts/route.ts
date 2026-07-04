import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { displayNameForPhone, loadProfiles, loadWhitelist } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { getMessengerPresence, isMessengerOnline } from "@/lib/messenger/push-store";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const whitelist = await loadWhitelist();
    const profiles = await loadProfiles();
    const contacts = await Promise.all(
      Object.values(whitelist)
      .filter((e) => e.status === "active" && e.phone !== phone)
      .map(async (e) => {
        const p = normalizeKzPhone(e.phone);
        const presence = await getMessengerPresence(p);
        return {
          phone: p,
          displayName: profiles[p]?.displayName ?? null,
          label: displayNameForPhone(p, profiles),
          online: isMessengerOnline(presence),
        };
      })
    );
    contacts.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return NextResponse.json({ contacts });
  } catch (err) {
    return jsonAuthError(err);
  }
}
