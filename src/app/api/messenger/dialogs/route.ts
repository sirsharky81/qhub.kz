import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";
import {
  getDmDialogSummariesForUser,
  displayNameForPhone,
  loadDialogPrefs,
  loadProfiles,
} from "@/lib/messenger/store";
import { getMessengerPresence, isMessengerOnline } from "@/lib/messenger/push-store";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const profiles = await loadProfiles();
    const dialogPrefs = await loadDialogPrefs(phone);
    const dialogs = await getDmDialogSummariesForUser(phone);
    const enriched = await Promise.all(
      dialogs.map(async (d) => {
        const presence = await getMessengerPresence(d.peerPhone);
        const prefs = dialogPrefs[d.chatId] ?? {
          pinnedAt: d.pinnedAt ?? null,
          pinOrder: d.pinOrder ?? null,
          archivedAt: d.archivedAt ?? null,
        };
        return {
          ...d,
          displayName: profiles[d.peerPhone]?.displayName ?? null,
          label: displayNameForPhone(d.peerPhone, profiles),
          peerOnline: isMessengerOnline(presence),
          pinnedAt: prefs.pinnedAt,
          pinOrder: prefs.pinOrder,
          archivedAt: prefs.archivedAt,
        };
      }),
    );
    void trackMessengerApiRequest("dialogs", 200);
    return NextResponse.json(
      { dialogs: enriched, dialogPrefs },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  } catch (err) {
    const res = jsonAuthError(err);
    void trackMessengerApiRequest("dialogs", res.status);
    return res;
  }
}
