"use client";

import { useEffect, useState } from "react";
import { fetchDmDialogs } from "@/lib/messenger/client";
import { subscribeUnreadChange, totalRoomUnreadFromServer } from "@/lib/messenger/unread";

export function useMessengerUnreadTotal(): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function refresh() {
      const data = await fetchDmDialogs().catch(() => ({ dialogs: [], roomDialogs: [], dialogPrefs: {} }));
      const dm = data.dialogs.reduce((sum, dialog) => sum + (dialog.unreadCount ?? 0), 0);
      const room = totalRoomUnreadFromServer(data.roomDialogs);
      setTotal(dm + room);
    }
    void refresh();
    return subscribeUnreadChange(() => {
      void refresh();
    });
  }, []);

  return total;
}
