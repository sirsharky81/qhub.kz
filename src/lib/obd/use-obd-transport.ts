"use client";

import { useEffect, useState } from "react";
import { getObdTransportKind, type ObdTransportKind } from "./create-ble-link";

/**
 * Detect BLE transport after mount. SSR/first paint has no Bluetooth API — do not
 * cache transport in useMemo([]) or buttons stay disabled on phone.
 */
export function useObdTransportKind(): { transport: ObdTransportKind; ready: boolean } {
  const [transport, setTransport] = useState<ObdTransportKind>("none");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTransport(getObdTransportKind());
    setReady(true);
  }, []);

  return { transport, ready };
}

export function obdTransportHint(kind: ObdTransportKind): string | null {
  if (kind === "capacitor-ble") return null;
  if (kind === "web-bluetooth") return "Web Bluetooth (Safari / Chrome). Нужен vLinker в режиме BLE.";
  return "Откройте в приложении QHub (Android) или Safari на iPhone. В Chrome на ПК Web Bluetooth может быть недоступен.";
}
