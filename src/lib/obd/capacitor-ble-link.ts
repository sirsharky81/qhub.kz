import { BleClient } from "@capacitor-community/bluetooth-le";
import {
  VLINKER_NAME_PREFIXES,
  VLINKER_NOTIFY,
  VLINKER_SERVICE,
  VLINKER_WRITE,
} from "./vlinker-uuids";
import type { BleAdapterInfo, BleLink } from "./ble-link";
import { chunkElmWriteBytes, lineToElmBytes } from "./ble-link";
import { decodeDataView, ElmRxBuffer, readElmUntilQuietPrompt } from "./elm-buffer";

export class CapacitorBleLink implements BleLink {
  readonly info: BleAdapterInfo;
  private rx = new ElmRxBuffer();
  private notifyStarted = false;
  private userClosed = false;
  private disconnectListener: (() => void) | null = null;

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

  setDisconnectListener(listener: (() => void) | null): void {
    this.disconnectListener = listener;
  }

  pullPending(): string {
    return this.rx.takePending();
  }

  async connect(): Promise<void> {
    this.userClosed = false;
    await BleClient.connect(this.info.id, () => {
      this.notifyStarted = false;
      if (this.userClosed) return;
      this.disconnectListener?.();
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
    this.userClosed = true;
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
    const chunks = chunkElmWriteBytes(lineToElmBytes(line));
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const view = new DataView(new ArrayBuffer(chunk.length));
      chunk.forEach((b, idx) => view.setUint8(idx, b));
      await BleClient.write(this.info.id, VLINKER_SERVICE, VLINKER_WRITE, view);
      if (chunks.length > 1 && i + 1 < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    }
  }

  discardInput(): void {
    this.rx.clear();
  }

  async readUntilPrompt(timeoutMs = 8000): Promise<string> {
    return readElmUntilQuietPrompt(this.rx, timeoutMs);
  }
}
