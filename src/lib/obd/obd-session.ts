import type { BleLink } from "./ble-link";
import { formatBleFailure } from "./ble-error";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  LIVE_PIDS,
  parseDtcsFromElmResponse,
  parseMode01Pid,
  type ObdDtc,
  type LivePidDefinition,
} from "./obd2";

export type ObdConnectionPhase = "idle" | "adapter" | "vehicle";

export interface VehicleLinkState {
  protocolLog: string[];
  elm: ElmIdentity;
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
    const probe = await this.elm.obdMode("0100");
    if (/UNABLE TO CONNECT|BUS INIT|CAN ERROR/i.test(probe)) {
      throw new Error(
        "Не удалось связаться с ECU по OBD. Зажигание ON, проверьте предохранители и разъём OBD-II.",
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
      const pidByte = parseInt(def.pid.slice(2, 4), 16);
      const bytes = parseMode01Pid(raw, pidByte);
      readings.push({
        def,
        value: bytes ? def.decode(bytes) : null,
        raw,
      });
    }
    return readings;
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
      throw new Error("Сначала выполните «Подключиться к автомобилю»");
    }
  }
}
