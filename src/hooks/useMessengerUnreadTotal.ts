"use client";

import { useEffect, useState } from "react";
import { countAllUnreadDm } from "@/lib/messenger/history-db";
import { subscribeUnreadChange, totalRoomUnread } from "@/lib/messenger/unread";

export function useMessengerUnreadTotal(): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function refresh() {
      const dm = await countAllUnreadDm().catch(() => 0);
      setTotal(dm + totalRoomUnread());
    }
    void refresh();
    return subscribeUnreadChange(() => {
      void refresh();
    });
  }, []);

  return total;
}
