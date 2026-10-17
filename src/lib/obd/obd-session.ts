import type { BleLink } from "./ble-link";
import { formatBleFailure } from "./ble-error";
import type { CanProtocol } from "./can-frame";
import { normalizeCanToken } from "./can-frame";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  MODULE_SCAN_ADDRESSES,
  assessUdsRequest,
  parseUdsResponse,
  type UdsParsed,
} from "./uds";
import {
  LIVE_PIDS,
  formatMode01Request,
  freezeFrameDtc,
  formatPidValue,
  parseDtcsFromElmResponse,
  parseMode01Bundle,
  parseMode01Pid,
  parseMode02Pid,
  parseMode09Ascii,
  parseMode09Cvn,
  parseReadiness,
  pidSupported,
  type ReadinessReport,
  type ObdDtc,
  type LivePidDefinition,
} from "./obd2";
import {
  DEFAULT_EXTRA_POLL_MS,
  EXTRA_PIDS,
  PID_SUPPORT_PAGES,
  pidApplies,
  tilesFromPid,
  type PidFuel,
  type PidTile,
} from "./pids";

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

export interface FreezeFrameReport {
  dtc: string | null;
  readings: { label: string; value: string; unit: string }[];
}

export interface VehicleIdentity {
  vin: string | null;
  calid: string | null;
  cvn: string | null;
}

const FREEZE_PIDS = ["010C", "010D", "0104", "0105", "0111", "0106"];

/** Universal OBD-II over ELM327 BLE (any ISO15765/OBD2 vehicle). */
export class ObdBleSession {
  private link: BleLink | null = null;
  private elm: Elm327Client | null = null;
  private elmIdentity: ElmIdentity | null = null;
  private bitmaps = new Map<number, number[]>();
  private readingCache = new Map<string, LivePidReading>();
  private extraTiles = new Map<string, PidTile>();
  private extraCursor = 0;
  private lastExtraAt = 0;
  private extraPollMs = DEFAULT_EXTRA_POLL_MS;
  private fuel: PidFuel | null = null;
  private sweep = 0;
  private batching: boolean | null = null;
  private lineMode: "obd" | "monitor" | "uds" = "obd";
  private canProtocol: CanProtocol | null = null;
  private linkLost: (() => void) | null = null;
  private leavePromise: Promise<void> | null = null;
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

  setLinkLostHandler(handler: (() => void) | null): void {
    this.linkLost = handler;
    this.link?.setDisconnectListener(() => this.handleLinkLost());
  }

  async readSupplyVoltage(): Promise<number | null> {
    this.requireAdapter();
    return this.elm!.readSupplyVoltage();
  }

  async leaveSpecialMode(): Promise<void> {
    if (this.leavePromise) return this.leavePromise;
    this.leavePromise = this.restoreLiveLine().finally(() => {
      this.leavePromise = null;
    });
    return this.leavePromise;
  }

  async startCanMonitor(protocol: CanProtocol, onLine: (line: string) => void): Promise<void> {
    this.requireAdapter();
    await this.waitLeave();
    await this.ensureMonitorProfile(protocol);
    await this.elm!.startMonitor(onLine);
  }

  async stopCanMonitor(): Promise<void> {
    await this.elm?.stopMonitor();
  }

  async applyCanFilter(protocol: CanProtocol, id: string, mask: string): Promise<void> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) {
      throw new Error("Остановите монитор, чтобы сменить фильтр");
    }
    const normId = normalizeCanToken(id, protocol);
    const normMask = normalizeCanToken(mask, protocol);
    await this.ensureMonitorProfile(protocol);
    if (!id.trim() && !mask.trim()) {
      await this.elm!.clearMonitorFilter(protocol);
      return;
    }
    if (!normId || !normMask) {
      throw new Error(protocol === "6" ? "ID и маска — hex до 7FF" : "ID и маска — hex до 1FFFFFFF");
    }
    await this.elm!.setMonitorFilter(normId, normMask);
  }

  async sendUds(
    protocol: CanProtocol,
    tx: string,
    rx: string,
    request: string,
    developer: boolean,
  ): Promise<{ raw: string; parsed: UdsParsed }> {
    const gate = assessUdsRequest(request, developer);
    if (!gate.ok) throw new Error(gate.message);
    this.requireAdapter();
    await this.waitLeave();
    await this.ensureUdsProfile(protocol);
    const txId = normalizeCanToken(tx, protocol);
    if (!txId) throw new Error("Неверный адрес запроса");
    const rxId = rx.trim() ? normalizeCanToken(rx, protocol) : null;
    if (rx.trim() && !rxId) throw new Error("Неверный адрес ответа");
    const raw = await this.udsExchange(Number.parseInt(txId, 16), rxId ? Number.parseInt(rxId, 16) : undefined, request);
    return { raw, parsed: parseUdsResponse(raw, gate.sid) };
  }

  async scanModules(
    protocol: CanProtocol,
    request: "10 01" | "3E 00",
    onProgress: (address: string, detail: string) => void,
  ): Promise<void> {
    const gate = assessUdsRequest(request, false);
    if (!gate.ok) throw new Error(gate.message);
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед сканером");
    await this.ensureUdsProfile(protocol);
    for (const address of MODULE_SCAN_ADDRESSES) {
      const label = address.toString(16).toUpperCase();
      onProgress(label, "запрос");
      await this.elm!.setCanHeader(address);
      let detail = "нет ответа";
      try {
        const raw = await this.udsExchange(address, undefined, request);
        const parsed = parseUdsResponse(raw, gate.sid);
        detail =
          parsed.kind === "positive"
            ? "ответил"
            : parsed.kind === "negative"
              ? `NRC ${parsed.nrcText ?? ""}`.trim()
              : raw.replace(/\s+/g, " ").trim().slice(0, 80) || "пустой ответ";
      } catch (error) {
        detail = error instanceof Error ? error.message : "ошибка";
      }
      onProgress(label, detail);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
      this.bindLost(link);
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

  /** How often one extra registry PID is requested. The fast gauges are not slowed to this. */
  setExtraPollMs(ms: number): void {
    this.extraPollMs = Math.max(200, ms);
  }

  async linkVehicle(): Promise<VehicleLinkState> {
    await this.leaveSpecialMode();
    if (!this.elm) throw new Error("Сначала подключите адаптер");
    this.fuel = null;
    this.extraTiles.clear();
    this.extraCursor = 0;
    this.lastExtraAt = 0;
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
    await this.detectFuel();
    this.phase = "vehicle";
    return { protocolLog, probe, elm: this.elmIdentity ?? { raw: probe, versionLine: null } };
  }

  async readObdDtcs(): Promise<ObdDtc[]> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const raw = await this.elm!.obdMode("03", 10_000, true);
    return parseDtcsFromElmResponse(raw);
  }

  async clearObdDtcs(): Promise<string> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    return this.elm!.obdMode("04", 10_000, true);
  }

  async readPendingDtcs(): Promise<ObdDtc[]> {
    return this.readDtcMode("07");
  }

  async readPermanentDtcs(): Promise<ObdDtc[]> {
    return this.readDtcMode("0A");
  }

  async readReadiness(): Promise<ReadinessReport | null> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const raw = await this.elm!.obdMode(formatMode01Request([0x01], 1), 4_000);
    return parseReadiness(raw);
  }

  async readFreezeFrame(): Promise<FreezeFrameReport> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    let dtcRaw = "";
    try {
      dtcRaw = await this.readMode02(0x02);
    } catch {
      dtcRaw = "";
    }
    const readings: FreezeFrameReport["readings"] = [];
    for (const pid of FREEZE_PIDS) {
      const def = LIVE_PIDS.find((item) => item.pid === pid);
      if (!def) continue;
      const pidByte = Number.parseInt(pid.slice(2, 4), 16);
      try {
        const raw = await this.readMode02(pidByte);
        const bytes = parseMode02Pid(raw, pidByte);
        const value = bytes && bytes.length >= def.bytes ? def.decode(bytes.slice(0, def.bytes)) : null;
        readings.push({ label: def.label, value: formatPidValue(value, def.digits), unit: def.unit });
      } catch {
        readings.push({ label: def.label, value: "—", unit: def.unit });
      }
    }
    return { dtc: freezeFrameDtc(parseMode02Pid(dtcRaw, 0x02)), readings };
  }

  async readVehicleIdentity(): Promise<VehicleIdentity> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const vin = await this.readMode09("0902");
    const calid = await this.readMode09("0904");
    const cvn = await this.readMode09("0906");
    return {
      vin: parseMode09Ascii(vin, 0x02),
      calid: parseMode09Ascii(calid, 0x04),
      cvn: parseMode09Cvn(cvn),
    };
  }

  async readLivePids(): Promise<LivePidReading[]> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const visible = LIVE_PIDS.filter((def) => this.pidIsSupported(def));
    const refreshSlow = this.sweep % 4 === 0;
    this.sweep += 1;
    const todo = visible.filter((def) => def.pace === "fast" || refreshSlow);
    await this.fillReadings(todo);
    await this.pollOneExtra();
    const standard = visible.map(
      (def) => this.readingCache.get(def.pid) ?? { def, value: null, raw: "" },
    );
    const extra = [...this.extraTiles.values()].map((tile) => readingFromTile(tile));
    return [...standard, ...extra];
  }

  async disconnect(): Promise<void> {
    try {
      if (this.elm?.isMonitoring) await this.elm.stopMonitor();
    } catch {
      this.elm?.abortMonitor();
    }
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
    this.resetExtra();
    this.sweep = 0;
    this.batching = null;
    this.lineMode = "obd";
    this.canProtocol = null;
    this.phase = "idle";
  }

  private bindLost(link: BleLink): void {
    link.setDisconnectListener(() => this.handleLinkLost());
  }

  private handleLinkLost(): void {
    this.elm?.abortMonitor();
    this.phase = "idle";
    this.lineMode = "obd";
    this.canProtocol = null;
    this.link = null;
    this.elm = null;
    this.elmIdentity = null;
    this.bitmaps.clear();
    this.readingCache.clear();
    this.resetExtra();
    this.sweep = 0;
    this.batching = null;
    this.linkLost?.();
  }

  private async waitLeave(): Promise<void> {
    if (this.leavePromise) await this.leavePromise;
  }

  private requireAdapter(): void {
    if (!this.elm || this.phase === "idle") {
      throw new Error("Сначала подключите адаптер");
    }
  }

  private async ensureMonitorProfile(protocol: CanProtocol): Promise<void> {
    if (this.elm!.isMonitoring) return;
    if (this.lineMode === "monitor" && this.canProtocol === protocol) return;
    await this.elm!.useMonitorProfile(protocol);
    this.lineMode = "monitor";
    this.canProtocol = protocol;
  }

  private async ensureUdsProfile(protocol: CanProtocol): Promise<void> {
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    if (this.lineMode === "uds" && this.canProtocol === protocol) return;
    await this.elm!.useUdsProfile(protocol);
    this.lineMode = "uds";
    this.canProtocol = protocol;
  }

  private async restoreLiveLine(): Promise<void> {
    if (this.elm?.isMonitoring) await this.elm.stopMonitor();
    if (!this.elm || this.phase === "idle" || this.lineMode === "obd") return;
    await this.elm.useLiveProfile();
    this.lineMode = "obd";
  }

  private async udsExchange(tx: number, rx: number | undefined, request: string): Promise<string> {
    const send = async () => {
      const standardRx = rx == null || rx === ((tx + 8) & 0x7ff);
      if (standardRx) await this.elm!.clearRxFilter();
      await this.elm!.setCanHeader(tx, standardRx ? undefined : rx);
      return this.elm!.sendPayload(request, 5_000);
    };
    try {
      return await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/Таймаут ELM/i.test(message)) throw error;
      return send();
    }
  }

  private async loadSupportBitmaps(first: number[]): Promise<void> {
    this.bitmaps.set(0x00, first.slice(0, 4));
    let base = 0x00;
    for (const next of PID_SUPPORT_PAGES) {
      if (next === 0x00) continue;
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

  private resetExtra(): void {
    this.extraTiles.clear();
    this.extraCursor = 0;
    this.lastExtraAt = 0;
    this.fuel = null;
  }

  private async detectFuel(): Promise<void> {
    try {
      const raw = await this.elm!.obdMode(formatMode01Request([0x01], 1), 4_000);
      const report = parseReadiness(raw);
      this.fuel = report ? (report.ignition === "дизель" ? "diesel" : "gasoline") : null;
    } catch {
      this.fuel = null;
    }
  }

  /** One registry PID per turn, and not faster than extraPollMs. Unsupported PIDs are never requested. */
  private async pollOneExtra(): Promise<void> {
    const visible = EXTRA_PIDS.filter((item) => pidApplies(item, this.fuel, this.bitmaps)).sort(
      (left, right) => left.priority - right.priority || left.pid.localeCompare(right.pid),
    );
    if (visible.length === 0) return;
    const now = Date.now();
    if (now - this.lastExtraAt < this.extraPollMs) return;
    this.lastExtraAt = now;
    const item = visible[this.extraCursor % visible.length]!;
    this.extraCursor += 1;
    const pid = Number.parseInt(item.pid.slice(2), 16);
    let bytes: number[] | null = null;
    try {
      const raw = await this.elm!.obdMode(formatMode01Request([pid], 1), 1_500);
      const parsed = parseMode01Pid(raw, pid);
      bytes = parsed && parsed.length >= item.bytes ? parsed.slice(0, item.bytes) : null;
    } catch {
      return;
    }
    for (const key of [...this.extraTiles.keys()]) {
      if (key.startsWith(`${item.pid}:`)) this.extraTiles.delete(key);
    }
    if (!bytes) return;
    for (const tile of tilesFromPid(item, bytes)) {
      this.extraTiles.set(`${item.pid}:${tile.label}`, tile);
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
      const missing: LivePidDefinition[] = [];
      for (const def of defs) {
        const pid = Number.parseInt(def.pid.slice(2, 4), 16);
        const bytes = parsed.get(pid);
        if (!bytes) {
          missing.push(def);
          continue;
        }
        this.readingCache.set(def.pid, {
          def,
          value: def.decode(bytes),
          raw,
        });
      }
      for (const def of missing) await this.readSingle(def);
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

  private async readDtcMode(mode: "07" | "0A"): Promise<ObdDtc[]> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const raw = await this.elm!.obdMode(mode, 10_000, true);
    return parseDtcsFromElmResponse(raw);
  }

  private async readMode02(pid: number): Promise<string> {
    const body = `02${pid.toString(16).padStart(2, "0").toUpperCase()}00`;
    return this.elm!.obdMode(body, 4_000);
  }

  private async readMode09(command: string): Promise<string> {
    try {
      return await this.elm!.obdMode(command, 8_000);
    } catch {
      return "";
    }
  }

  private requireVehicle(): void {
    if (this.phase !== "vehicle" || !this.elm) {
      throw new Error("Сначала выполните «Подключиться к автомобилю»");
    }
  }
}

function readingFromTile(tile: PidTile): LivePidReading {
  return {
    def: {
      pid: "extra",
      label: tile.label,
      unit: tile.unit,
      bytes: 0,
      digits: tile.digits,
      pace: "slow",
      decode: () => tile.value,
    },
    value: tile.value,
    raw: "",
  };
}
