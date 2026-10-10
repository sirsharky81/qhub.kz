import { BleClient } from "@capacitor-community/bluetooth-le";
import {
  VLINKER_NAME_PREFIXES,
  VLINKER_NOTIFY,
  VLINKER_SERVICE,
  VLINKER_WRITE,
} from "./vlinker-uuids";
import type { BleAdapterInfo, BleLink } from "./ble-link";
import { lineToElmBytes } from "./ble-link";
import { decodeDataView, ElmRxBuffer } from "./elm-buffer";

export class CapacitorBleLink implements BleLink {
  readonly info: BleAdapterInfo;
  private rx = new ElmRxBuffer();
  private notifyStarted = false;

  private constructor(info: BleAdapterInfo) {
    this.info = info;
  }

  static async requestDevice(): Promise<CapacitorBleLink> {
    await BleClient.initialize({ androidNeverForLocation: true });
    const enabled = await BleClient.isEnabled();
    if (!enabled) {
      try {
        await BleClient.requestEnable();
      } catch {
        throw new Error("Включите Bluetooth на устройстве");
      }
    }

    const device = await BleClient.requestDevice({
      namePrefix: VLINKER_NAME_PREFIXES[0],
      optionalServices: [VLINKER_SERVICE],
    });

    const info: BleAdapterInfo = {
      id: device.deviceId,
      name: device.name ?? "vLinker",
      transport: "capacitor-ble",
    };
    return new CapacitorBleLink(info);
  }

  async connect(): Promise<void> {
    await BleClient.connect(this.info.id, () => {
      this.notifyStarted = false;
    });

    if (!this.notifyStarted) {
      await BleClient.startNotifications(
        this.info.id,
        VLINKER_SERVICE,
        VLINKER_NOTIFY,
        (value) => {
          this.rx.appendChunk(decodeDataView(value));
        },
      );
      this.notifyStarted = true;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.notifyStarted) {
        await BleClient.stopNotifications(this.info.id, VLINKER_SERVICE, VLINKER_NOTIFY);
      }
    } catch {
      /* ignore */
    }
    this.notifyStarted = false;
    try {
      await BleClient.disconnect(this.info.id);
    } catch {
      /* ignore */
    }
  }

  async writeLine(line: string): Promise<void> {
    const bytes = lineToElmBytes(line);
    const view = new DataView(new ArrayBuffer(bytes.length));
    bytes.forEach((b, i) => view.setUint8(i, b));
    await BleClient.write(this.info.id, VLINKER_SERVICE, VLINKER_WRITE, view);
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
