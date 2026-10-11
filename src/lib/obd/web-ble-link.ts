import {
  VLINKER_NAME_PREFIXES,
  VLINKER_NOTIFY,
  VLINKER_SERVICE,
  VLINKER_WRITE,
} from "./vlinker-uuids";
import type { BleAdapterInfo, BleLink } from "./ble-link";
import { lineToElmBytes } from "./ble-link";
import { decodeDataView, ElmRxBuffer } from "./elm-buffer";

type BluetoothRemoteGATTCharacteristic = {
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
  value?: DataView;
};

type BluetoothRemoteGATTService = {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
};

type BluetoothGATTServer = {
  connected: boolean;
  connect(): Promise<BluetoothGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
};

type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: BluetoothGATTServer;
};

function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function webBluetoothSupported(): boolean {
  return isWebBluetoothAvailable();
}

export class WebBleLink implements BleLink {
  readonly info: BleAdapterInfo;
  private device: BluetoothDevice | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
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
    const bluetooth = (navigator as Navigator & { bluetooth: { requestDevice: (o: unknown) => Promise<BluetoothDevice> } })
      .bluetooth;
    const filters = VLINKER_NAME_PREFIXES.map((namePrefix) => ({ namePrefix }));
    const device = await bluetooth.requestDevice({
      filters,
      optionalServices: [VLINKER_SERVICE],
    });
    const info: BleAdapterInfo = {
      id: device.id,
      name: device.name ?? "vLinker",
      transport: "web-bluetooth",
    };
    return new WebBleLink(info, device);
  }

  async connect(): Promise<void> {
    if (!this.device?.gatt) throw new Error("GATT недоступен");
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(VLINKER_SERVICE);
    this.notifyChar = await service.getCharacteristic(VLINKER_NOTIFY);
    this.writeChar = await service.getCharacteristic(VLINKER_WRITE);

    this.onNotify = (ev: Event) => {
      const target = ev.target as unknown as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      this.rx.appendChunk(decodeDataView(target.value));
    };
    this.notifyChar.addEventListener("characteristicvaluechanged", this.onNotify);
    await this.notifyChar.startNotifications();
  }

  async disconnect(): Promise<void> {
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
    if (!this.writeChar) throw new Error("Адаптер не подключён");
    await this.writeChar.writeValue(lineToElmBytes(line));
  }

  async readUntilPrompt(timeoutMs = 8000): Promise<string> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.rx.hasPrompt()) {
        const snap = this.rx.snapshot();
        this.rx.clear();
        return snap;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const partial = this.rx.snapshot();
    this.rx.clear();
    throw new Error(
      partial.trim()
        ? `Таймаут ELM (частичный ответ): ${partial.slice(-120)}`
        : "Таймаут ELM — нет ответа от адаптера",
    );
  }
}
