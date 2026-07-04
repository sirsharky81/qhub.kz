import { afterEach, describe, expect, it } from "vitest";
import { deriveDmChatId, normalizeKzPhone } from "./phone";
import {
  applyDmUnreadOnMessage,
  countPinnedDialogs,
  getDmDialogSummariesForUser,
  loadDialogPrefs,
  markDmDialogRead,
  pushDmEnvelope,
  setPinnedDialogsOrder,
  setDialogPrefs,
  touchDmUserIndex,
} from "./store";
import { REDIS_DIALOG_PREFS_PREFIX, REDIS_DM_PREFIX, REDIS_DM_USER_INDEX_PREFIX } from "./constants";
import { redisDel, redisGetJson, redisSet } from "./redis";

function dmIndexKey(phone: string): string {
  return `${REDIS_DM_USER_INDEX_PREFIX}${normalizeKzPhone(phone)}`;
}

function dmMessagesKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:messages`;
}

function dmMetaKey(chatId: string): string {
  return `${REDIS_DM_PREFIX}${chatId}:meta`;
}

async function cleanupDmKeys(chatId: string, ...phones: string[]): Promise<void> {
  await redisDel(
    dmMessagesKey(chatId),
    dmMetaKey(chatId),
    ...phones.map((p) => dmIndexKey(p)),
    ...phones.map((p) => `${REDIS_DIALOG_PREFS_PREFIX}${normalizeKzPhone(p)}`),
  );
}

describe("messenger dm unread cursor", () => {
  const me = "+77011110001";
  const peer = "+77011110002";
  const chatId = deriveDmChatId(me, peer);

  afterEach(async () => {
    await cleanupDmKeys(chatId, me, peer);
  });

  it("increments recipient unread for new dm message", async () => {
    await touchDmUserIndex(chatId, 1000);
    await applyDmUnreadOnMessage({
      chatId,
      senderPhone: me,
      type: "text",
      ts: 1200,
      recipientViewingThisChat: false,
    });

    const mySummary = (await getDmDialogSummariesForUser(me)).find((d) => d.chatId === chatId);
    const peerSummary = (await getDmDialogSummariesForUser(peer)).find((d) => d.chatId === chatId);

    expect(mySummary?.unreadCount).toBe(0);
    expect(mySummary?.lastMessageFromMe).toBe(true);
    expect(mySummary?.lastMessageType).toBe("text");

    expect(peerSummary?.unreadCount).toBe(1);
    expect(peerSummary?.latestUnreadAt).toBe(1200);
    expect(peerSummary?.lastMessageFromMe).toBe(false);
    expect(peerSummary?.lastMessageType).toBe("text");
  });

  it("does not increment unread while recipient views same chat", async () => {
    await touchDmUserIndex(chatId, 2000);
    await applyDmUnreadOnMessage({
      chatId,
      senderPhone: me,
      type: "image",
      ts: 2100,
      recipientViewingThisChat: true,
    });

    const peerSummary = (await getDmDialogSummariesForUser(peer)).find((d) => d.chatId === chatId);
    expect(peerSummary?.unreadCount).toBe(0);
    expect(peerSummary?.latestUnreadAt).toBeNull();
    expect(peerSummary?.lastMessageType).toBe("image");
  });

  it("resets unread with markDmDialogRead", async () => {
    await touchDmUserIndex(chatId, 3000);
    await applyDmUnreadOnMessage({
      chatId,
      senderPhone: me,
      type: "audio",
      ts: 3200,
      recipientViewingThisChat: false,
    });

    await markDmDialogRead(peer, chatId);
    const peerSummary = (await getDmDialogSummariesForUser(peer)).find((d) => d.chatId === chatId);
    expect(peerSummary?.unreadCount).toBe(0);
    expect(peerSummary?.latestUnreadAt).toBeNull();
  });

  it("backfills legacy index entries missing unread fields", async () => {
    const meIndex = {
      [chatId]: {
        chatId,
        peerPhone: peer,
        lastMessageAt: 0,
      },
    };
    await redisSet(dmIndexKey(me), JSON.stringify(meIndex));
    await touchDmUserIndex(chatId, 3900);

    await pushDmEnvelope(chatId, {
      kind: "message",
      id: "m1",
      from: peer,
      ts: 4000,
      type: "text",
      ciphertext: "c1",
      iv: "i1",
    });
    await pushDmEnvelope(chatId, {
      kind: "message",
      id: "m2",
      from: me,
      ts: 4500,
      type: "file",
      ciphertext: "c2",
      iv: "i2",
      filename: "doc.pdf",
    });

    const summary = (await getDmDialogSummariesForUser(me)).find((d) => d.chatId === chatId);
    expect(summary?.unreadCount).toBe(1);
    expect(summary?.latestUnreadAt).toBe(4000);
    expect(summary?.lastMessageType).toBe("file");
    expect(summary?.lastMessageFromMe).toBe(true);

    const saved = await redisGetJson<Record<string, { unreadCount?: number; lastMessageType?: string }>>(
      dmIndexKey(me),
    );
    expect(saved?.[chatId]?.unreadCount).toBe(1);
    expect(saved?.[chatId]?.lastMessageType).toBe("file");
  });

  it("sorts dialogs by unread recency first", async () => {
    const peer2 = "+77011110003";
    const chat2 = deriveDmChatId(me, peer2);
    await cleanupDmKeys(chat2, me, peer2);

    await touchDmUserIndex(chatId, 5000);
    await touchDmUserIndex(chat2, 5100);

    await applyDmUnreadOnMessage({
      chatId,
      senderPhone: peer,
      type: "text",
      ts: 5200,
      recipientViewingThisChat: false,
    });

    await applyDmUnreadOnMessage({
      chatId: chat2,
      senderPhone: peer2,
      type: "text",
      ts: 5300,
      recipientViewingThisChat: false,
    });

    const summaries = await getDmDialogSummariesForUser(me);
    expect(summaries[0]?.chatId).toBe(chat2);
    expect(summaries[1]?.chatId).toBe(chatId);

    await cleanupDmKeys(chat2, me, peer2);
  });

  it("stores dialog pin/archive prefs per user", async () => {
    const pinned = await setDialogPrefs(me, chatId, { pinnedAt: 7777 });
    expect(pinned.pinnedAt).toBe(7777);
    expect(pinned.archivedAt).toBeNull();

    const archived = await setDialogPrefs(me, chatId, { archivedAt: 8888, pinnedAt: null });
    expect(archived.pinnedAt).toBeNull();
    expect(archived.archivedAt).toBe(8888);

    const prefs = await loadDialogPrefs(me);
    expect(prefs[chatId]?.archivedAt).toBe(8888);
    expect(prefs[chatId]?.pinnedAt).toBeNull();
  });

  it("reorders pinned dialogs by pinOrder", async () => {
    const peer2 = "+77011110003";
    const chat2 = deriveDmChatId(me, peer2);
    await cleanupDmKeys(chat2, me, peer2);

    await setDialogPrefs(me, chatId, { pinnedAt: 100, pinOrder: 2 });
    await setDialogPrefs(me, chat2, { pinnedAt: 200, pinOrder: 1 });
    await setPinnedDialogsOrder(me, [chatId, chat2]);

    const prefs = await loadDialogPrefs(me);
    expect(prefs[chatId]?.pinOrder).toBe(1);
    expect(prefs[chat2]?.pinOrder).toBe(2);
    expect(await countPinnedDialogs(me)).toBe(2);

    await cleanupDmKeys(chat2, me, peer2);
  });
});
