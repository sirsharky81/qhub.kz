import { isNativePlatform } from "@/lib/platform/runtime";
import type { BleLink } from "./ble-link";
import { CapacitorBleLink } from "./capacitor-ble-link";
import { webBluetoothSupported, WebBleLink } from "./web-ble-link";

export type ObdTransportKind = "none" | "web-bluetooth" | "capacitor-ble";

export function getObdTransportKind(): ObdTransportKind {
  if (isNativePlatform()) return "capacitor-ble";
  if (webBluetoothSupported()) return "web-bluetooth";
  return "none";
}

export async function requestBleLink(): Promise<BleLink> {
  const kind = getObdTransportKind();
  if (kind === "capacitor-ble") return CapacitorBleLink.requestDevice();
  if (kind === "web-bluetooth") return WebBleLink.requestDevice();
  throw new Error(
    "Bluetooth недоступен: используйте Safari с Web Bluetooth (vLinker BLE) или приложение QHub для Android",
  );
}
