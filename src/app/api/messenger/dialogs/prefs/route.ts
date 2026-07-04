import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import {
  countPinnedDialogs,
  loadDialogPrefs,
  maxPinnedDialogs,
  setDialogPrefs,
  setPinnedDialogsOrder,
} from "@/lib/messenger/store";

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
    if (hasPinned && body.pinned) {
      const prefsByDialog = await loadDialogPrefs(phone);
      const alreadyPinned = (prefsByDialog[dialogId]?.pinnedAt ?? 0) > 0;
      const currentPinned = await countPinnedDialogs(phone);
      const maxPinned = maxPinnedDialogs();
      if (!alreadyPinned && currentPinned >= maxPinned) {
        return NextResponse.json(
          { error: `Можно закрепить не более ${maxPinned} диалогов` },
          { status: 400 },
        );
      }
    }

    const prefs = await setDialogPrefs(phone, dialogId, {
      pinnedAt: hasPinned ? (body.pinned ? now : null) : undefined,
      pinOrder: hasPinned ? (body.pinned ? now : null) : undefined,
      archivedAt: hasArchived ? (body.archived ? now : null) : undefined,
    });

    return NextResponse.json({ ok: true, dialogId, prefs });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as { dialogIds?: string[] };
    const dialogIds = Array.isArray(body.dialogIds)
      ? body.dialogIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (dialogIds.length === 0) {
      return NextResponse.json({ error: "Укажите dialogIds" }, { status: 400 });
    }
    if (dialogIds.length > maxPinnedDialogs()) {
      return NextResponse.json(
        { error: `Можно закрепить не более ${maxPinnedDialogs()} диалогов` },
        { status: 400 },
      );
    }

    for (const dialogId of dialogIds) {
      await assertChannelParticipant(phone, dialogId);
    }
    await setPinnedDialogsOrder(phone, dialogIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
