import type { BleLink } from "./ble-link";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  LIVE_PIDS,
  parseDtcsFromElmResponse,
  parseMode01Pid,
  type ObdDtc,
  type LivePidDefinition,
} from "./obd2";
import {
  ETACS_PROFILES,
  readEtacsCoding,
  type EtacsCanProfile,
  type EtacsCodingDump,
} from "./mitsubishi-etacs";

export type DiagnosticPhase = "idle" | "adapter" | "vehicle";

export interface VehicleLinkState {
  protocolLog: string[];
  elm: ElmIdentity;
}

export interface LivePidReading {
  def: LivePidDefinition;
  value: number | null;
  raw: string;
}

export class DiagnosticSession {
  private link: BleLink | null = null;
  private elm: Elm327Client | null = null;
  private elmIdentity: ElmIdentity | null = null;
  phase: DiagnosticPhase = "idle";
  lastError: string | null = null;

  get transport(): ObdTransportKind {
    return getObdTransportKind();
  }

  get adapterName(): string | null {
    return this.link?.info.name ?? null;
  }

  async connectAdapter(): Promise<{ name: string; elm: ElmIdentity }> {
    this.lastError = null;
    await this.disconnect();
    const link = await requestBleLink();
    await link.connect();
    const elm = new Elm327Client(link);
    const identity = await elm.resetAndIdentify();
    this.link = link;
    this.elm = elm;
    this.elmIdentity = identity;
    this.phase = "adapter";
    return { name: link.info.name, elm: identity };
  }

  async linkVehicle(): Promise<VehicleLinkState> {
    if (!this.elm) throw new Error("Сначала подключите адаптер");
    this.lastError = null;
    const protocolLog = await this.elm.initForObd();
    const probe = await this.elm.obdMode("0100");
    if (/UNABLE TO CONNECT|BUS INIT|CAN ERROR/i.test(probe)) {
      throw new Error(
        "Не удалось связаться с блоками по OBD. Проверьте зажигание, предохранители и протокол (ATSP0).",
      );
    }
    this.phase = "vehicle";
    return { protocolLog, elm: this.elmIdentity ?? { raw: probe, versionLine: null } };
  }

  async readObdDtcs(): Promise<ObdDtc[]> {
    this.requireVehicle();
    const raw = await this.elm!.obdMode("03");
    return parseDtcsFromElmResponse(raw);
  }

  async clearObdDtcs(): Promise<string> {
    this.requireVehicle();
    return this.elm!.obdMode("04");
  }

  async readLivePids(): Promise<LivePidReading[]> {
    this.requireVehicle();
    const readings: LivePidReading[] = [];
    for (const def of LIVE_PIDS) {
      const raw = await this.elm!.obdMode(def.pid);
      const service = parseInt(def.pid.slice(2, 4), 16);
      const bytes = parseMode01Pid(raw, service);
      readings.push({
        def,
        value: bytes ? def.decode(bytes) : null,
        raw,
      });
    }
    return readings;
  }

  async downloadEtacsCoding(profileId?: string): Promise<EtacsCodingDump> {
    this.requireVehicle();
    const profile =
      ETACS_PROFILES.find((p) => p.id === profileId) ?? ETACS_PROFILES[0]!;
    return readEtacsCoding(this.elm!, profile);
  }

  listEtacsProfiles(): EtacsCanProfile[] {
    return ETACS_PROFILES;
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
    this.phase = "idle";
  }

  private requireVehicle(): void {
    if (this.phase !== "vehicle" || !this.elm) {
      throw new Error("Сначала выполните «Подключение к автомобилю»");
    }
  }
}
