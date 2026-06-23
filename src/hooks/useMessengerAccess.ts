"use client";

import { useEffect, useState } from "react";
import { fetchAccessCheck } from "@/lib/messenger/client";

export function useMessengerAccess() {
  const [messengerLoggedIn, setMessengerLoggedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAccessCheck().then((data) => {
      if (!cancelled) {
        setMessengerLoggedIn(!!data.messengerLoggedIn);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { messengerLoggedIn, loaded };
}
