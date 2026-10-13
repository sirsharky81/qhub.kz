import type { BleLink } from "./ble-link";
import { formatBleFailure } from "./ble-error";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  LIVE_PIDS,
  formatMode01Request,
  parseDtcsFromElmResponse,
  parseMode01Bundle,
  parseMode01Pid,
  pidSupported,
  type ObdDtc,
  type LivePidDefinition,
} from "./obd2";

export type ObdConnectionPhase = "idle" | "adapter" | "vehicle";

export interface VehicleLinkState {
  protocolLog: string[];
  elm: ElmIdentity;
  probe: string;
}

export interface LivePidReading {
  def: LivePidDefinition;
  value: number | null;
  raw: string;
}

/** Universal OBD-II over ELM327 BLE (any ISO15765/OBD2 vehicle). */
export class ObdBleSession {
  private link: BleLink | null = null;
  private elm: Elm327Client | null = null;
  private elmIdentity: ElmIdentity | null = null;
  private bitmaps = new Map<number, number[]>();
  private readingCache = new Map<string, LivePidReading>();
  private sweep = 0;
  private batching: boolean | null = null;
  phase: ObdConnectionPhase = "idle";

  get transport(): ObdTransportKind {
    return getObdTransportKind();
  }

  get adapterName(): string | null {
    return this.link?.info.name ?? null;
  }

  /** For manufacturer-specific modules (e.g. Mitsubishi ETACS). */
  getElm(): Elm327Client | null {
    return this.elm;
  }

  async connectAdapter(): Promise<{ name: string; elm: ElmIdentity }> {
    await this.disconnect();
    let link: BleLink | null = null;
    try {
      link = await requestBleLink();
      await link.connect();
      const elm = new Elm327Client(link);
      const identity = await elm.resetAndIdentify();
      this.link = link;
      this.elm = elm;
      this.elmIdentity = identity;
      this.phase = "adapter";
      return { name: link.info.name, elm: identity };
    } catch (error) {
      if (link && this.link !== link) {
        try {
          await link.disconnect();
        } catch {
          /* drop a half-open Bluefy session so the next tap can connect */
        }
      }
      throw new Error(formatBleFailure(error));
    }
  }

  async linkVehicle(): Promise<VehicleLinkState> {
    if (!this.elm) throw new Error("Сначала подключите адаптер");
    const protocolLog = await this.elm.initForObd();
    const probe = await this.elm.probeStandardObd();
    const supported = parseMode01Pid(probe, 0x00);
    if (!supported) {
      const compact = probe.replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(
        compact
          ? `ЭБУ не ответил на 0100. Зажигание ON. Ответ адаптера: ${compact}`
          : "ЭБУ не ответил на 0100. Зажигание ON, проверьте разъём OBD-II.",
      );
    }
    await this.loadSupportBitmaps(supported.slice(0, 4));
    this.phase = "vehicle";
    return { protocolLog, probe, elm: this.elmIdentity ?? { raw: probe, versionLine: null } };
  }

  async readObdDtcs(): Promise<ObdDtc[]> {
    this.requireVehicle();
    const raw = await this.elm!.obdMode("03", 10_000, true);
    return parseDtcsFromElmResponse(raw);
  }

  async clearObdDtcs(): Promise<string> {
    this.requireVehicle();
    return this.elm!.obdMode("04", 10_000, true);
  }

  async readLivePids(): Promise<LivePidReading[]> {
    this.requireVehicle();
    const visible = LIVE_PIDS.filter((def) => this.pidIsSupported(def));
    const refreshSlow = this.sweep % 4 === 0;
    this.sweep += 1;
    const todo = visible.filter((def) => def.pace === "fast" || refreshSlow);
    await this.fillReadings(todo);
    return visible.map(
      (def) => this.readingCache.get(def.pid) ?? { def, value: null, raw: "" },
    );
  }

  async disconnect(): Promise<void> {
    try {
      await this.link?.disconnect();
    } catch {
      /* ignore */
    }
    this.link = null;
    this.elm = null;
    this.elmIdentity = null;
    this.bitmaps.clear();
    this.readingCache.clear();
    this.sweep = 0;
    this.batching = null;
    this.phase = "idle";
  }

  private async loadSupportBitmaps(first: number[]): Promise<void> {
    this.bitmaps.set(0x00, first.slice(0, 4));
    let base = 0x00;
    for (const next of [0x20, 0x40, 0x60]) {
      if (pidSupported(this.bitmaps.get(base), next, base) !== true) break;
      try {
        const raw = await this.elm!.obdMode(formatMode01Request([next], 1), 4_000);
        const bytes = parseMode01Pid(raw, next);
        if (!bytes || bytes.length < 4) break;
        this.bitmaps.set(next, bytes.slice(0, 4));
        base = next;
      } catch {
        break;
      }
    }
  }

  private pidIsSupported(def: LivePidDefinition): boolean {
    const pid = Number.parseInt(def.pid.slice(2, 4), 16);
    const base = pid & ~0x1f;
    if (base > 0 && !this.bitmaps.has(base)) {
      const prev = base - 0x20;
      const prevMap = this.bitmaps.get(prev);
      if (!prevMap || pidSupported(prevMap, base, prev) !== true) return false;
    }
    return pidSupported(this.bitmaps.get(base), pid, base) !== false;
  }

  private async fillReadings(defs: LivePidDefinition[]): Promise<void> {
    const size = this.batching === false ? 1 : 4;
    for (let offset = 0; offset < defs.length; ) {
      const chunk = defs.slice(offset, offset + (this.batching === false ? 1 : size));
      offset += chunk.length;
      if (chunk.length > 1 && this.batching !== false) {
        const ok = await this.readBatch(chunk);
        if (ok) {
          this.batching = true;
          continue;
        }
        if (this.batching !== true) this.batching = false;
      }
      for (const def of chunk) await this.readSingle(def);
    }
  }

  private async readBatch(defs: LivePidDefinition[]): Promise<boolean> {
    const specs = defs.map((def) => ({
      pid: Number.parseInt(def.pid.slice(2, 4), 16),
      bytes: def.bytes,
    }));
    try {
      const raw = await this.elm!.obdMode(
        formatMode01Request(specs.map((spec) => spec.pid), 1),
        4_000,
      );
      const parsed = parseMode01Bundle(raw, specs);
      if (parsed.size === 0) return false;
      for (const def of defs) {
        const pid = Number.parseInt(def.pid.slice(2, 4), 16);
        const bytes = parsed.get(pid);
        this.readingCache.set(def.pid, {
          def,
          value: bytes ? def.decode(bytes) : null,
          raw,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private async readSingle(def: LivePidDefinition): Promise<void> {
    const pid = Number.parseInt(def.pid.slice(2, 4), 16);
    try {
      const raw = await this.elm!.obdMode(formatMode01Request([pid], 1), 2_500);
      const bytes = parseMode01Pid(raw, pid);
      this.readingCache.set(def.pid, {
        def,
        value: bytes && bytes.length >= def.bytes ? def.decode(bytes.slice(0, def.bytes)) : null,
        raw,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.readingCache.set(def.pid, { def, value: null, raw: message });
    }
  }

  private requireVehicle(): void {
    if (this.phase !== "vehicle" || !this.elm) {
      throw new Error("Сначала выполните «Подключиться к автомобилю»");
    }
  }
}
