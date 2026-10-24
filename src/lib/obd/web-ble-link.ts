import {
  ELM_BLE_CHAR_PAIRS,
  ELM_BLE_OPTIONAL_SERVICES,
  VLINKER_NAME_PREFIXES,
} from "./vlinker-uuids";
import type { BleAdapterInfo, BleLink } from "./ble-link";
import { chunkElmWriteBytes, lineToElmBytes } from "./ble-link";
import { decodeDataView, ElmRxBuffer, readElmUntilQuietPrompt } from "./elm-buffer";
import {
  formatBleFailure,
  isBleUserCancel,
  isBluefyBrowser,
  isNumericBleFailure,
  looksLikeObdAdapterName,
  preferWriteWithoutResponse,
} from "./ble-error";

type BluetoothCharacteristicProperties = {
  write?: boolean;
  writeWithoutResponse?: boolean;
  notify?: boolean;
  indicate?: boolean;
};

type BluetoothRemoteGATTCharacteristic = {
  uuid?: string;
  properties?: BluetoothCharacteristicProperties;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
  value?: DataView;
};

type BluetoothRemoteGATTService = {
  uuid?: string;
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics?(): Promise<BluetoothRemoteGATTCharacteristic[]>;
};

type BluetoothGATTServer = {
  connected: boolean;
  connect(): Promise<BluetoothGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices?(): Promise<BluetoothRemoteGATTService[]>;
};

type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: BluetoothGATTServer;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
};

type BluetoothNavigator = {
  requestDevice(options: unknown): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
};

function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function webBluetoothSupported(): boolean {
  return isWebBluetoothAvailable();
}

function bluetoothApi(): BluetoothNavigator {
  return (navigator as Navigator & { bluetooth: BluetoothNavigator }).bluetooth;
}

function shortBluetoothUuid(uuid: string): string | null {
  const match = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(uuid);
  return match?.[1] ?? null;
}

/**
 * Module-level cache of the last selected BluetoothDevice and active WebBleLink.
 * On iOS (Bluefy / Safari Web Bluetooth) and Android Chrome, once a BLE peripheral
 * is connected at the GATT layer, it stops advertising — so calling `bluetooth.requestDevice()`
 * a second time from another modal shows an empty Bluetooth picker until the user backs out!
 * Reusing the already-connected link or already-permitted `BluetoothDevice` avoids the duplicate picker.
 */
let cachedBluetoothDevice: BluetoothDevice | null = null;
let cachedActiveDevice: BluetoothDevice | null = null;

export class WebBleLink implements BleLink {
  readonly info: BleAdapterInfo;
  private device: BluetoothDevice | null = null;
  private userClosed = false;
  private disconnectListener: (() => void) | null = null;
  private readonly onGattLost = () => {
    if (cachedActiveDevice === this.device) {
      cachedActiveDevice = null;
    }
    if (this.userClosed) return;
    this.disconnectListener?.();
  };
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private useWriteWithoutResponse = false;
  private rx = new ElmRxBuffer();
  private onNotify: ((ev: Event) => void) | null = null;

  constructor(info: BleAdapterInfo, device: BluetoothDevice) {
    this.info = info;
    this.device = device;
  }

  static async requestDevice(): Promise<WebBleLink> {
    if (!isWebBluetoothAvailable()) {
      throw new Error("Web Bluetooth недоступен в этом браузере");
    }
    // 1. If there is already an active GATT-connected device whose serial channel opened in this tab, reuse it
    if (cachedActiveDevice?.gatt?.connected) {
      const dev = cachedActiveDevice;
      return new WebBleLink(
        {
          id: dev.id,
          name: dev.name ?? "vLinker",
          transport: "web-bluetooth",
        },
        dev,
      );
    }

    const bluetooth = bluetoothApi();
    // 2. On Bluefy (iOS), check `navigator.bluetooth.getDevices()` for an already connected OBD adapter.
    // On Chrome (Android/Desktop), always go through `requestDevice` when not yet active in this tab
    // so Chrome grants permission to all `ELM_BLE_OPTIONAL_SERVICES` (including 0x18F0 and ISSC UART for vLinker MC-IOS).
    if (isBluefyBrowser()) {
      if (cachedBluetoothDevice?.gatt?.connected) {
        return new WebBleLink(
          {
            id: cachedBluetoothDevice.id,
            name: cachedBluetoothDevice.name ?? "vLinker",
            transport: "web-bluetooth",
          },
          cachedBluetoothDevice,
        );
      }
      const permitted = await pickPermittedDevice(bluetooth, true);
      if (permitted) {
        cachedBluetoothDevice = permitted;
        return new WebBleLink(
          {
            id: permitted.id,
            name: permitted.name ?? "vLinker",
            transport: "web-bluetooth",
          },
          permitted,
        );
      }
    }

    const device = await requestObdDevice(bluetooth);
    cachedBluetoothDevice = device;
    const info: BleAdapterInfo = {
      id: device.id,
      name: device.name ?? "vLinker",
      transport: "web-bluetooth",
    };
    return new WebBleLink(info, device);
  }

  setDisconnectListener(listener: (() => void) | null): void {
    this.disconnectListener = listener;
  }

  pullPending(): string {
    return this.rx.takePending();
  }

  async connect(): Promise<void> {
    this.userClosed = false;
    try {
      await this.openSerial();
      cachedActiveDevice = this.device;
    } catch (error) {
      if (cachedActiveDevice === this.device) {
        cachedActiveDevice = null;
      }
      if (cachedBluetoothDevice === this.device) {
        cachedBluetoothDevice = null;
      }
      try {
        this.device?.gatt?.disconnect();
      } catch {
        /* ignore */
      }
      throw new Error(formatBleFailure(error));
    }
  }

  async disconnect(): Promise<void> {
    this.userClosed = true;
    if (cachedActiveDevice === this.device) {
      cachedActiveDevice = null;
    }
    this.device?.removeEventListener?.("gattserverdisconnected", this.onGattLost);
    if (this.notifyChar && this.onNotify) {
      this.notifyChar.removeEventListener("characteristicvaluechanged", this.onNotify);
      try {
        await this.notifyChar.stopNotifications();
      } catch {
        /* already stopped */
      }
    }
    this.notifyChar = null;
    this.writeChar = null;
    this.device?.gatt?.disconnect();
    this.device = null;
  }

  async writeLine(line: string): Promise<void> {
    const char = this.writeChar;
    if (!char) throw new Error("Адаптер не подключён");
    const chunks = chunkElmWriteBytes(lineToElmBytes(line));
    const withoutResponse = char.writeValueWithoutResponse?.bind(char);
    const withResponse = (char.writeValueWithResponse ?? char.writeValue).bind(char);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const attempts: Array<{ withoutResp: boolean; fn: () => Promise<void> }> = [];
      if (this.useWriteWithoutResponse && withoutResponse) {
        attempts.push({ withoutResp: true, fn: () => withoutResponse(chunk) });
        attempts.push({ withoutResp: false, fn: () => withResponse(chunk) });
      } else {
        attempts.push({ withoutResp: false, fn: () => withResponse(chunk) });
        if (withoutResponse) {
          attempts.push({ withoutResp: true, fn: () => withoutResponse(chunk) });
        }
      }
      let last: unknown;
      let sent = false;
      for (const attempt of attempts) {
        try {
          await attempt.fn();
          this.useWriteWithoutResponse = attempt.withoutResp;
          sent = true;
          break;
        } catch (error) {
          last = error;
          // Brief backoff in case Android GATT stack had an in-flight notification
          await new Promise((resolve) => setTimeout(resolve, 15));
          try {
            await attempt.fn();
            this.useWriteWithoutResponse = attempt.withoutResp;
            sent = true;
            break;
          } catch (retryError) {
            last = retryError;
          }
        }
      }
      if (!sent) {
        throw new Error(formatBleFailure(last));
      }
      // Small pacing delay between 20-byte BLE UART chunks so vLinker UART FIFO never overflows
      if (chunks.length > 1 && i + 1 < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    }
  }

  discardInput(): void {
    this.rx.clear();
  }

  async readUntilPrompt(
    timeoutMs = 8000,
    options?: { quietMs?: number; allowBarePrompt?: boolean },
  ): Promise<string> {
    return readElmUntilQuietPrompt(this.rx, timeoutMs, options);
  }

  private async openSerial(): Promise<void> {
    const server = await this.openServer();
    const { notify, write } = await bindSerial(server);
    this.notifyChar = notify;
    this.writeChar = write;
    this.useWriteWithoutResponse = preferWriteWithoutResponse(write.properties, isBluefyBrowser());

    this.onNotify = (ev: Event) => {
      const chunk = notificationBytes(ev);
      if (!chunk) return;
      this.rx.appendChunk(chunk);
    };
    this.notifyChar.addEventListener("characteristicvaluechanged", this.onNotify);
    await this.notifyChar.startNotifications();
    // Give Android/iOS GATT stack 50ms to finish writing the CCCD (0x2902) descriptor before ATZ is sent
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.device?.removeEventListener?.("gattserverdisconnected", this.onGattLost);
    this.device?.addEventListener?.("gattserverdisconnected", this.onGattLost);
  }

  private async openServer(): Promise<BluetoothGATTServer> {
    const gatt = this.device?.gatt;
    if (!gatt) throw new Error("GATT недоступен");
    if (gatt.connected) return gatt;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await gatt.connect();
      } catch (error) {
        if (gatt.connected) return gatt;
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }
}

async function requestObdDevice(bluetooth: BluetoothNavigator): Promise<BluetoothDevice> {
  const optionalServices = [...ELM_BLE_OPTIONAL_SERVICES];
  if (isBluefyBrowser()) {
    // Bluefy drops namePrefix filters and then rejects with a bare number (often 2).
    try {
      return await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
    } catch (error) {
      if (isBleUserCancel(error)) throw new Error(formatBleFailure(error));
      const permitted = await pickPermittedDevice(bluetooth);
      if (permitted) return permitted;
      throw new Error(formatBleFailure(error));
    }
  }

  try {
    return await bluetooth.requestDevice({
      filters: VLINKER_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
      optionalServices,
    });
  } catch (error) {
    if (isBleUserCancel(error) || !isNumericBleFailure(error)) {
      throw new Error(formatBleFailure(error));
    }
    return bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
  }
}

async function pickPermittedDevice(
  bluetooth: BluetoothNavigator,
  requireConnectedGatt = false,
): Promise<BluetoothDevice | null> {
  if (!bluetooth.getDevices) return null;
  try {
    const devices = await bluetooth.getDevices();
    if (requireConnectedGatt) {
      const connectedAdapter = devices.find(
        (device) => device.gatt?.connected && looksLikeObdAdapterName(device.name),
      );
      if (connectedAdapter) return connectedAdapter;
      const anyConnected = devices.find((device) => device.gatt?.connected);
      return anyConnected ?? null;
    }
    const named = devices.find((device) => looksLikeObdAdapterName(device.name));
    if (named) return named;
    return devices.length === 1 ? devices[0] ?? null : null;
  } catch {
    return null;
  }
}

export async function bindSerial(server: BluetoothGATTServer): Promise<{
  notify: BluetoothRemoteGATTCharacteristic;
  write: BluetoothRemoteGATTCharacteristic;
}> {
  const services = await collectServices(server);
  let lastError: unknown;
  for (const service of services) {
    try {
      return await bindOnService(service);
    } catch (error) {
      lastError = error;
    }
  }
  // Fallback for split-service BLE adapters (e.g. notify on 0xFFE0 and write on 0xFFE5)
  const cross = await bindAcrossServices(services);
  if (cross) return cross;

  throw new Error(formatBleFailure(lastError ?? 2));
}

async function collectServicesOnce(
  server: BluetoothGATTServer,
): Promise<BluetoothRemoteGATTService[]> {
  const found: BluetoothRemoteGATTService[] = [];
  for (const uuid of ELM_BLE_OPTIONAL_SERVICES) {
    const service = await getService(server, uuid);
    if (service && !found.includes(service)) {
      found.push(service);
    }
  }
  if (server.getPrimaryServices) {
    try {
      const all = await server.getPrimaryServices();
      for (const svc of all) {
        if (!found.includes(svc)) {
          found.push(svc);
        }
      }
    } catch {
      /* Bluefy or strict Chrome when no optional services match */
    }
  }
  return found;
}

async function collectServices(server: BluetoothGATTServer): Promise<BluetoothRemoteGATTService[]> {
  let found = await collectServicesOnce(server);
  if (found.length > 0) return found;

  // On Android Chrome, GATT service discovery right after connect() can take a brief moment
  // or drop if the adapter was switching from another phone. Reconnect if needed and retry once.
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!server.connected) {
    try {
      await server.connect();
    } catch {
      /* ignore */
    }
  }
  found = await collectServicesOnce(server);
  if (found.length > 0) return found;

  throw new Error(formatBleFailure(2));
}

async function getService(
  server: BluetoothGATTServer,
  uuid: string,
): Promise<BluetoothRemoteGATTService | null> {
  try {
    return await server.getPrimaryService(uuid);
  } catch {
    const short = shortBluetoothUuid(uuid);
    if (!short) return null;
    try {
      return await server.getPrimaryService(short);
    } catch {
      return null;
    }
  }
}

function canCharNotify(char: BluetoothRemoteGATTCharacteristic): boolean {
  if (!char.properties) return true;
  return Boolean(char.properties.notify || char.properties.indicate);
}

function canCharWrite(char: BluetoothRemoteGATTCharacteristic): boolean {
  if (!char.properties) return true;
  return Boolean(char.properties.write || char.properties.writeWithoutResponse);
}

async function bindOnService(service: BluetoothRemoteGATTService): Promise<{
  notify: BluetoothRemoteGATTCharacteristic;
  write: BluetoothRemoteGATTCharacteristic;
}> {
  for (const [notifyId, writeId] of ELM_BLE_CHAR_PAIRS) {
    try {
      const notify = await getCharacteristic(service, notifyId);
      const write = await getCharacteristic(service, writeId);
      if (canCharNotify(notify) && canCharWrite(write)) {
        return { notify, write };
      }
      if (canCharNotify(write) && canCharWrite(notify)) {
        return { notify: write, write: notify };
      }
    } catch {
      /* try the next known pair */
    }
  }
  if (service.getCharacteristics) {
    const chars = await service.getCharacteristics();
    const notify = chars.find((char) => char.properties?.notify || char.properties?.indicate);
    const write = chars.find(
      (char) => char.properties?.write || char.properties?.writeWithoutResponse,
    );
    if (notify && write) return { notify, write };
  }
  throw new Error("На сервисе адаптера нет характеристик чтения и записи");
}

async function bindAcrossServices(
  services: BluetoothRemoteGATTService[],
): Promise<{
  notify: BluetoothRemoteGATTCharacteristic;
  write: BluetoothRemoteGATTCharacteristic;
} | null> {
  let notify: BluetoothRemoteGATTCharacteristic | undefined;
  let write: BluetoothRemoteGATTCharacteristic | undefined;
  for (const service of services) {
    if (!service.getCharacteristics) continue;
    try {
      const chars = await service.getCharacteristics();
      if (!notify) {
        notify = chars.find((c) => c.properties?.notify || c.properties?.indicate);
      }
      if (!write) {
        write = chars.find((c) => c.properties?.write || c.properties?.writeWithoutResponse);
      }
      if (notify && write) return { notify, write };
    } catch {
      /* ignore service without accessible characteristics */
    }
  }
  return null;
}

async function getCharacteristic(
  service: BluetoothRemoteGATTService,
  uuid: string,
): Promise<BluetoothRemoteGATTCharacteristic> {
  try {
    return await service.getCharacteristic(uuid);
  } catch (error) {
    const short = shortBluetoothUuid(uuid);
    if (!short) throw error;
    return service.getCharacteristic(short);
  }
}

function notificationBytes(ev: Event): string | null {
  const target = ev.target as unknown as BluetoothRemoteGATTCharacteristic | null;
  if (target?.value) return decodeDataView(target.value);
  const detail = (ev as CustomEvent).detail;
  if (detail instanceof DataView) return decodeDataView(detail);
  if (detail instanceof ArrayBuffer) return decodeDataView(new DataView(detail));
  return null;
}
