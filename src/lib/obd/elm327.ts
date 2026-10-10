import type { BleLink } from "./ble-link";

export interface ElmIdentity {
  raw: string;
  versionLine: string | null;
}

export class Elm327Client {
  private queue: Promise<void> = Promise.resolve();

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
      await this.link.writeLine(command);
      return this.link.readUntilPrompt(timeoutMs);
    });
  }

  async resetAndIdentify(): Promise<ElmIdentity> {
    const raw = await this.sendCommand("ATZ", 12_000);
    const versionLine =
      raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("AT") && l !== ">") ?? null;
    return { raw, versionLine };
  }

  async initForObd(): Promise<string[]> {
    const steps = ["ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
    const logs: string[] = [];
    for (const cmd of steps) {
      logs.push(await this.sendCommand(cmd));
    }
    return logs;
  }

  async setCanHeader(txId: number, rxId?: number): Promise<void> {
    const tx = txId.toString(16).toUpperCase();
    await this.sendCommand(`ATSH${tx}`);
    if (rxId != null) {
      const rx = rxId.toString(16).toUpperCase();
      try {
        await this.sendCommand(`ATCRA${rx}`);
      } catch {
        try {
          await this.sendCommand(`ATCP${rx}`);
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
    await this.setCanHeader(0x7df);
    return this.sendPayload(command, timeoutMs);
  }
}
