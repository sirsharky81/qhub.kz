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
  /** 7E0 talks to the engine only. 7DF wakes every ECU and waits for each. */
  private obdTx = 0x7df;

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
    const steps = ["ATE0", "ATL0", "ATS1", "ATH0", "ATAT2", "ATSP6"];
    const logs: string[] = [];
    for (const cmd of steps) {
      logs.push(await this.sendCommand(cmd));
    }
    this.txHeader = null;
    this.rxHeader = null;
    return logs;
  }

  /**
   * Engine address 7E0 first, so a second module does not hold every reply.
   * Then functional 7DF, then a full protocol search.
   */
  async probeStandardObd(): Promise<string> {
    const attempts: { tx: number; protocol: string | null; timeout: number }[] = [
      { tx: 0x7e0, protocol: null, timeout: 5_000 },
      { tx: 0x7df, protocol: null, timeout: 8_000 },
      { tx: 0x7df, protocol: "ATSP0", timeout: 20_000 },
    ];
    let last = "";
    for (const attempt of attempts) {
      if (attempt.protocol) {
        await this.sendCommand(attempt.protocol);
        this.txHeader = null;
      }
      await this.setCanHeader(attempt.tx);
      last = await this.sendPayload("0100 1", attempt.timeout);
      if (parseMode01Pid(last, 0x00)) {
        this.obdTx = attempt.tx;
        return last;
      }
    }
    return last;
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

  async obdMode(command: string, timeoutMs = 10_000, broadcast = false): Promise<string> {
    if (this.rxHeader != null) {
      try {
        await this.sendCommand("ATAR");
      } catch {
        /* functional OBD accepts every ECU */
      }
      this.rxHeader = null;
    }
    await this.setCanHeader(broadcast ? 0x7df : this.obdTx);
    return this.sendPayload(command, timeoutMs);
  }
}
