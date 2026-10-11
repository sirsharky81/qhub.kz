"use client";

import { useEffect, useState } from "react";
import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";
import { getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { webBluetoothSupported } from "./web-ble-link";

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
  if (kind === "web-bluetooth") return "Web Bluetooth. vLinker должен быть в режиме BLE.";
  return explainObdTransportBlocked();
}

/** Why connect stays disabled when transport is `none`. */
export function explainObdTransportBlocked(): string {
  if (typeof navigator === "undefined") {
    return "Откройте страницу в браузере на телефоне.";
  }
  if (isIOSDevice() && isStandalonePWA()) {
    return (
      "На iPhone Bluetooth в ярлыке «На экран Домой» (PWA) не работает. " +
      "Удалите старый ярлык Mitsubishi/OBD. Откройте в Safari вкладку: qhub.kz/tools/obd-diag"
    );
  }
  if (isIOSDevice() && !webBluetoothSupported()) {
    return "На этом iPhone Web Bluetooth недоступен (нужен Safari, актуальный iOS). Либо используйте QHub на Android.";
  }
  return "Android — приложение QHub из APK. iPhone — Safari (не Chrome, не Telegram). ПК — обычно не поддерживается.";
}
