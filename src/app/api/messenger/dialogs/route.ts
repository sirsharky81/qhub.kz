import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";
import { getDmDialogSummariesForUser, displayNameForPhone, loadProfiles } from "@/lib/messenger/store";
import { getMessengerPresence, isMessengerOnline } from "@/lib/messenger/push-store";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const profiles = await loadProfiles();
    const dialogs = await getDmDialogSummariesForUser(phone);
    const enriched = await Promise.all(
      dialogs.map(async (d) => {
        const presence = await getMessengerPresence(d.peerPhone);
        return {
          ...d,
          displayName: profiles[d.peerPhone]?.displayName ?? null,
          label: displayNameForPhone(d.peerPhone, profiles),
          peerOnline: isMessengerOnline(presence),
        };
      }),
    );
    void trackMessengerApiRequest("dialogs", 200);
    return NextResponse.json(
      { dialogs: enriched },
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
