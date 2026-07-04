import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { setDialogPrefs } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as {
      dialogId?: string;
      pinned?: boolean;
      archived?: boolean;
    };
    const dialogId = typeof body.dialogId === "string" ? body.dialogId.trim() : "";
    if (!(dialogId.startsWith("dm:") || dialogId.startsWith("room:"))) {
      return NextResponse.json({ error: "Укажите корректный dialogId" }, { status: 400 });
    }

    await assertChannelParticipant(phone, dialogId);

    const hasPinned = typeof body.pinned === "boolean";
    const hasArchived = typeof body.archived === "boolean";
    if (!hasPinned && !hasArchived) {
      return NextResponse.json({ error: "Укажите pinned или archived" }, { status: 400 });
    }

    const now = Date.now();
    const prefs = await setDialogPrefs(phone, dialogId, {
      pinnedAt: hasPinned ? (body.pinned ? now : null) : undefined,
      archivedAt: hasArchived ? (body.archived ? now : null) : undefined,
    });

    return NextResponse.json({ ok: true, dialogId, prefs });
  } catch (err) {
    return jsonAuthError(err);
  }
}
