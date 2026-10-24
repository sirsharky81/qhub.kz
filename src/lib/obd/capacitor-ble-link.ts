import { BleClient } from "@capacitor-community/bluetooth-le";
import {
  ELM_BLE_CHAR_PAIRS,
  ELM_BLE_OPTIONAL_SERVICES,
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
  private activeService = VLINKER_SERVICE;
  private activeNotify = VLINKER_NOTIFY;
  private activeWrite = VLINKER_WRITE;
  private useWriteWithoutResponse = false;

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
      optionalServices: [...ELM_BLE_OPTIONAL_SERVICES],
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

    await this.resolveGattChannel();

    if (!this.notifyStarted) {
      await BleClient.startNotifications(
        this.info.id,
        this.activeService,
        this.activeNotify,
        (value) => {
          this.rx.appendChunk(decodeDataView(value));
        },
      );
      this.notifyStarted = true;
    }
  }

  private async resolveGattChannel(): Promise<void> {
    try {
      const services = await BleClient.getServices(this.info.id);
      if (!services || services.length === 0) return;
      for (const svc of services) {
        const chars = svc.characteristics ?? [];
        for (const [notifyUuid, writeUuid] of ELM_BLE_CHAR_PAIRS) {
          const nChar = chars.find((c) => c.uuid.toLowerCase() === notifyUuid.toLowerCase());
          const wChar = chars.find((c) => c.uuid.toLowerCase() === writeUuid.toLowerCase());
          if (nChar && wChar) {
            this.activeService = svc.uuid;
            this.activeNotify = nChar.uuid;
            this.activeWrite = wChar.uuid;
            this.useWriteWithoutResponse = Boolean(
              wChar.properties?.writeWithoutResponse && !wChar.properties?.write,
            );
            return;
          }
        }
        const nFallback = chars.find((c) => c.properties?.notify || c.properties?.indicate);
        const wFallback = chars.find(
          (c) => c.properties?.write || c.properties?.writeWithoutResponse,
        );
        if (nFallback && wFallback) {
          this.activeService = svc.uuid;
          this.activeNotify = nFallback.uuid;
          this.activeWrite = wFallback.uuid;
          this.useWriteWithoutResponse = Boolean(
            wFallback.properties?.writeWithoutResponse && !wFallback.properties?.write,
          );
          return;
        }
      }
    } catch {
      /* keep default FFF0 / FFF1 / FFF2 */
    }
  }

  async disconnect(): Promise<void> {
    this.userClosed = true;
    try {
      if (this.notifyStarted) {
        await BleClient.stopNotifications(
          this.info.id,
          this.activeService,
          this.activeNotify,
        );
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
      if (this.useWriteWithoutResponse) {
        await BleClient.writeWithoutResponse(
          this.info.id,
          this.activeService,
          this.activeWrite,
          view,
        );
      } else {
        try {
          await BleClient.write(
            this.info.id,
            this.activeService,
            this.activeWrite,
            view,
          );
        } catch {
          await BleClient.writeWithoutResponse(
            this.info.id,
            this.activeService,
            this.activeWrite,
            view,
          );
          this.useWriteWithoutResponse = true;
        }
      }
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
}
