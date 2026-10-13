import type { BleLink } from "./ble-link";
import { parseMode01Pid } from "./obd2";

export interface ElmIdentity {
  raw: string;
  versionLine: string | null;
}

export class Elm327Client {
  private queue: Promise<void> = Promise.resolve();
  private txHeader: number | null = null;
  private rxHeader: number | null = null;

  constructor(private readonly link: BleLink) {}

  /** Serialize commands — ELM327 handles one conversation at a time. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async sendCommand(command: string, timeoutMs?: number): Promise<string> {
    return this.run(async () => {
      this.link.discardInput();
      await this.link.writeLine(command);
      return this.link.readUntilPrompt(timeoutMs);
    });
  }

  async resetAndIdentify(): Promise<ElmIdentity> {
    const raw = await this.sendCommand("ATZ", 12_000);
    const lines = raw.split(/\r|\n/).map((l) => l.trim()).filter(Boolean);
    const versionLine =
      lines.find((l) => /ELM|STN|OBD|vLink/i.test(l) && !l.startsWith("AT")) ??
      lines.find((l) => l !== ">" && !l.startsWith("AT") && l.toUpperCase() !== "OK") ??
      null;
    return { raw, versionLine };
  }

  /**
   * Spaces on, headers off. Protocol 6 is ISO 15765-4 CAN 11/500
   * (Pajero / Outlander / Subaru gasoline).
   */
  async initForObd(): Promise<string[]> {
    const steps = ["ATE0", "ATL0", "ATS1", "ATH0", "ATSP6"];
    const logs: string[] = [];
    for (const cmd of steps) {
      logs.push(await this.sendCommand(cmd));
    }
    this.txHeader = null;
    this.rxHeader = null;
    return logs;
  }

  /** 0100 on the current protocol, then auto-search if the ECU stays silent. */
  async probeStandardObd(): Promise<string> {
    await this.setCanHeader(0x7df);
    const first = await this.sendPayload("0100", 8_000);
    if (parseMode01Pid(first, 0x00)) return first;
    await this.sendCommand("ATSP0");
    this.txHeader = null;
    await this.setCanHeader(0x7df);
    return this.sendPayload("0100", 20_000);
  }

  async setCanHeader(txId: number, rxId?: number): Promise<void> {
    if (this.txHeader !== txId) {
      const tx = txId.toString(16).toUpperCase();
      await this.sendCommand(`ATSH${tx}`);
      this.txHeader = txId;
    }
    if (rxId != null && this.rxHeader !== rxId) {
      const rx = rxId.toString(16).toUpperCase();
      try {
        await this.sendCommand(`ATCRA${rx}`);
        this.rxHeader = rxId;
      } catch {
        try {
          await this.sendCommand(`ATCP${rx}`);
          this.rxHeader = rxId;
        } catch {
          /* Some clones ignore RX filter */
        }
      }
    }
  }

  /** Send OBD/UDS payload bytes (without CAN ID — header must be set). */
  async sendPayload(hexPayload: string, timeoutMs = 10_000): Promise<string> {
    const compact = hexPayload.replace(/\s+/g, " ").trim();
    return this.sendCommand(compact, timeoutMs);
  }

  async obdMode(command: string, timeoutMs = 10_000): Promise<string> {
    if (this.rxHeader != null) {
      try {
        await this.sendCommand("ATAR");
      } catch {
        /* functional OBD accepts every ECU */
      }
      this.rxHeader = null;
    }
    await this.setCanHeader(0x7df);
    return this.sendPayload(command, timeoutMs);
  }
}
