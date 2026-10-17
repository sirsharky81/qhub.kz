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
  /** Protocol used by the live OBD profile, restored when leaving CAN/UDS. */
  private obdProtocol = "6";

  constructor(private readonly link: BleLink) {}

  private monitoring = false;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitorTail = "";
  private monitorOnLine: ((line: string) => void) | null = null;
  private stopPromise: Promise<void> | null = null;

  get isMonitoring(): boolean {
    return this.monitoring;
  }

  /** Serialize commands — ELM327 handles one conversation at a time. */
  private run<T>(fn: () => Promise<T>, allowDuringMonitor = false): Promise<T> {
    const task = async () => {
      if (this.monitoring && !allowDuringMonitor) {
        throw new Error("Остановите CAN-монитор, затем повторите команду");
      }
      return fn();
    };
    const next = this.queue.then(task, task);
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
    this.obdProtocol = "6";
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
        this.obdProtocol = "0";
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
    const trimmed = hexPayload.replace(/\s+/g, " ").trim();
    // Preserve trailing frame-count digit in OBD mode (e.g. "010C0D 1"),
    // otherwise strip internal spaces so ELM327 clones never misparse multi-byte UDS/SSM hex.
    const frameMatch = trimmed.match(/^([0-9A-Fa-f\s]+?)\s+([1-9])$/);
    const command = frameMatch
      ? `${frameMatch[1]!.replace(/\s+/g, "").toUpperCase()} ${frameMatch[2]}`
      : trimmed.replace(/\s+/g, "").toUpperCase();
    return this.sendCommand(command, timeoutMs);
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

  /** Live gauges: spaces on, headers off, previous OBD header. Does not reset the adapter. */
  async useLiveProfile(): Promise<void> {
    await this.runProfile(["ATE0", "ATL0", "ATS1", "ATH0", "ATAT2", `ATSP${this.obdProtocol}`]);
    try {
      await this.sendCommand("ATAR");
    } catch {
      /* some clones have no receive filter */
    }
    this.rxHeader = null;
    await this.sendCommand("ATCF000");
    await this.sendCommand("ATCM000");
    await this.setCanHeader(this.obdTx);
  }

  /** Raw CAN monitor. Headers on, spaces off, no ISO-TP formatting. */
  async useMonitorProfile(protocol: "6" | "7"): Promise<void> {
    await this.runProfile(["ATE0", "ATL0", "ATH1", "ATS0", `ATSP${protocol}`, "ATCAF0", "ATD1"]);
  }

  /**
   * UDS / SSM. Headers off: a 3-nibble CAN id would shift `7F` off the byte grid.
   * Forget the cached header — ATSP can leave the adapter on 7DF while we still think it is 7E0.
   * ATAR drops ATCRA. On a vLinker that filter turns a real reply into NO DATA; ELM already accepts tx+8.
   */
  async useUdsProfile(protocol: "6" | "7"): Promise<void> {
    await this.runProfile(["ATE0", "ATL0", "ATH0", "ATS0", `ATSP${protocol}`, "ATCAF1", "ATSTFF"]);
    this.txHeader = null;
    try {
      await this.sendCommand("ATAR");
    } catch {
      /* some clones have no receive filter */
    }
    this.rxHeader = null;
  }

  async readSupplyVoltage(): Promise<number | null> {
    const raw = await this.sendCommand("ATRV", 3_000);
    const match = raw.match(/(\d+(?:[.,]\d+)?)\s*V/i);
    if (!match?.[1]) return null;
    const value = Number(match[1].replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }

  async clearRxFilter(): Promise<void> {
    if (this.rxHeader == null) return;
    try {
      await this.sendCommand("ATAR");
    } catch {
      /* some clones have no receive filter */
    }
    this.rxHeader = null;
  }

  async setMonitorFilter(id: string, mask: string): Promise<void> {
    await this.sendCommand(`ATCF${id}`);
    await this.sendCommand(`ATCM${mask}`);
  }

  async clearMonitorFilter(protocol: "6" | "7"): Promise<void> {
    const zeros = protocol === "6" ? "000" : "00000000";
    await this.setMonitorFilter(zeros, zeros);
  }

  async startMonitor(onLine: (line: string) => void): Promise<void> {
    if (this.monitoring) return;
    await this.run(async () => {
      this.link.discardInput();
      await this.link.writeLine("ATMA");
      this.monitoring = true;
      this.monitorTail = "";
      this.monitorOnLine = onLine;
    });
    this.armMonitorPump();
  }

  abortMonitor(): void {
    this.disarmMonitorPump();
    this.monitoring = false;
    this.monitorTail = "";
    this.monitorOnLine = null;
  }

  async stopMonitor(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!this.monitoring && !this.monitorTimer) return;
    this.stopPromise = this.finishMonitor().finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async runProfile(commands: string[]): Promise<void> {
    for (const command of commands) {
      await this.sendCommand(command);
    }
    this.txHeader = null;
    this.rxHeader = null;
  }

  private armMonitorPump(): void {
    this.disarmMonitorPump();
    this.monitorTimer = setInterval(() => {
      if (!this.monitoring) return;
      const chunk = this.link.pullPending();
      if (!chunk) return;
      this.monitorTail += chunk;
      if (chunk.includes(">")) {
        const tail = this.monitorTail;
        this.disarmMonitorPump();
        this.monitoring = false;
        this.monitorTail = "";
        this.emitMonitorText(tail);
        this.monitorOnLine = null;
        return;
      }
      const parts = this.monitorTail.split(/\r|\n/);
      this.monitorTail = parts.pop() ?? "";
      for (const part of parts) this.emitMonitorLine(part);
    }, 40);
  }

  private disarmMonitorPump(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  private async finishMonitor(): Promise<void> {
    this.disarmMonitorPump();
    const onLine = this.monitorOnLine;
    const pending = this.monitorTail + (this.monitoring ? this.link.pullPending() : "");
    this.monitorTail = "";
    if (!this.monitoring) {
      this.emitMonitorText(pending, onLine);
      this.monitorOnLine = null;
      return;
    }
    let rest = "";
    try {
      await this.run(async () => {
        await this.link.writeLine("");
        rest = await this.link.readUntilPrompt(5_000);
      }, true);
    } finally {
      this.monitoring = false;
      this.monitorOnLine = null;
    }
    this.emitMonitorText(pending + rest, onLine);
  }

  private emitMonitorText(text: string, onLine: ((line: string) => void) | null = this.monitorOnLine): void {
    for (const part of text.split(/\r|\n/)) this.emitMonitorLine(part, onLine);
  }

  private emitMonitorLine(part: string, onLine: ((line: string) => void) | null = this.monitorOnLine): void {
    const line = part.replace(/>/g, "").trim();
    if (!line || /^STOPPED$/i.test(line)) return;
    onLine?.(line);
  }
}
