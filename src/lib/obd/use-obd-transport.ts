"use client";

import { useEffect, useState } from "react";
import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";
import { resetNativePlatformCache } from "@/lib/platform/runtime";
import { isBluefyBrowser } from "./ble-error";
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
    const detect = () => {
      resetNativePlatformCache();
      const next = getObdTransportKind();
      setTransport((prev) => (prev === next ? prev : next));
      setReady(true);
    };
    detect();
    const retry = window.setTimeout(detect, 600);
    return () => window.clearTimeout(retry);
  }, []);

  return { transport, ready };
}

export function obdTransportHint(kind: ObdTransportKind): string | null {
  if (kind === "capacitor-ble") return null;
  if (kind === "web-bluetooth") {
    if (isBluefyBrowser()) {
      return (
        "Bluefy: кнопка «2. Подключиться к автомобилю» включается после кнопки 1 на этой странице. " +
        "Выберите vLinker в списке. Если адаптер уже соединён в меню Bluefy — сначала отключите его там."
      );
    }
    return "Web Bluetooth. vLinker должен быть в режиме BLE.";
  }
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
