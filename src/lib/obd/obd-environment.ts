"use client";

import { Capacitor } from "@capacitor/core";
import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";
import { getNativePlatform, isNativePlatform, resetNativePlatformCache } from "@/lib/platform/runtime";
import { getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { webBluetoothSupported } from "./web-ble-link";

export interface ObdEnvironmentDiagnostics {
  transport: ObdTransportKind;
  webBluetoothApi: boolean;
  capacitorNative: boolean;
  capacitorPlatform: string;
  iosStandalonePwa: boolean;
  userAgent: string;
}

export function probeObdEnvironment(): ObdEnvironmentDiagnostics {
  resetNativePlatformCache();
  let capacitorPlatform = "web";
  try {
    capacitorPlatform = Capacitor.getPlatform();
  } catch {
    /* ignore */
  }
  return {
    transport: getObdTransportKind(),
    webBluetoothApi: webBluetoothSupported(),
    capacitorNative: isNativePlatform(),
    capacitorPlatform,
    iosStandalonePwa: isIOSDevice() && isStandalonePWA(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

export function formatObdEnvironmentLines(d: ObdEnvironmentDiagnostics): string[] {
  return [
    `Транспорт: ${d.transport}`,
    `navigator.bluetooth: ${d.webBluetoothApi ? "да" : "нет"}`,
    `Capacitor native: ${d.capacitorNative ? "да" : "нет"} (${d.capacitorPlatform})`,
    `iPhone PWA (ярлык): ${d.iosStandalonePwa ? "да — Web BT не работает" : "нет"}`,
    `Платформа QHub: ${getNativePlatform()}`,
  ];
}
