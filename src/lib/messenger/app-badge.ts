import { totalRoomUnread } from "./unread";
import { countAllUnreadDm } from "./history-db";

export async function refreshAppBadge(dmUnread?: number, roomUnread?: number): Promise<void> {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  const dm = dmUnread ?? (await countAllUnreadDm().catch(() => 0));
  const room = roomUnread ?? totalRoomUnread();
  const total = dm + room;
  try {
    if (total > 0) {
      await navigator.setAppBadge(total);
    } else if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch {
    // ignore unsupported
  }
}
