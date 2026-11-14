import type { BleLink } from "./ble-link";
import { formatBleFailure } from "./ble-error";
import type { CanProtocol } from "./can-frame";
import { normalizeCanToken } from "./can-frame";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  ETACS_PROFILES,
  readEtacsCoding,
  writeEtacsSingleBlock,
  type EtacsCodingDump,
  type EtacsWriteBlockResult,
} from "./mitsubishi-etacs";
import {
  calibrateMitsubishiSasZero,
  executeMitsubishiServiceProcedure,
  readMitsubishiMeter,
  readMitsubishiSteeringAngle,
  readMitsubishiTransmission,
  readTpmsSensors,
  type MitsubishiMeterReport,
  type MitsubishiSteeringReport,
  type MitsubishiTcmTelemetry,
  type SasCalibrationResult,
  type TpmsModuleReport,
} from "./mitsubishi-modules";
import type { MitsubishiServiceExecutionResult } from "./mitsubishi-service-procedures";
import { parseMitsubishiModuleIdentity } from "./mitsubishi-mut-monitor";
import {
  readMitsubishiTpmsDidIds,
  runMitsubishiTpmsRoutine,
  writeMitsubishiTpmsIds,
  type TpmsDidWriteResult,
  type TpmsRoutineOptions,
} from "./mitsubishi-tpms-register";
import type { TpmsDidRecipe, TpmsRoutineResult } from "./mitsubishi-tpms-registration";
import {
  calibrateSubaruSteeringZero,
  executeSubaruServiceAction,
  executeSubaruUdsProcedure,
  type SubaruServiceActionId,
  type SubaruUdsProcedureResult,
} from "./subaru-steering-calibration";
import { readSubaruCvtFluidTemp, type SubaruCvtFluidReading } from "./subaru-cvt-read";
import {
  SUBARU_EYESIGHT_VARIANT_READ_DIDS,
  SUBARU_METER_12COLUMN_READ_DIDS,
  SUBARU_METER_ALL_VARIANT_A0XX_DIDS,
  compareMeterAndEyesightVariants,
  extractAppliedModelAndOptionCodeFromDump,
  extractEyesightVariantFromDids,
  type SubaruDumpCodeMatch,
  type SubaruEyesightVariantMatch,
  type SubaruMeterEyesightCompare,
} from "./subaru-ssm4-catalog";
import { SSM4_YYW_FP_DID_KEYS } from "./subaru-ssm4-yyw-fingerprints";
import {
  readSubaruEyesight35xxDids,
  writeSubaruEyesightVariantByApplied,
  type SubaruEyesightVariantWriteResult,
  type SubaruEyesightWriteMode,
} from "./subaru-eyesight-variant";
import type { SubaruEyesightWriteEntry } from "./subaru-eyesight-backup";
import {
  writeSubaruMeter12ColumnCode as executeSubaruMeter12ColumnWrite,
  type SubaruMeter12ColumnWriteResult,
  type SubaruMeterWriteMode,
} from "./subaru-meter-variant";
import type { SubaruMeterA0xxWriteEntry } from "./subaru-meter-backup";
import {
  probeSubaruResCm as executeSubaruResCmProbe,
  registerSubaruResCm as executeSubaruResCmRegister,
  type SubaruResProbeResult,
  type SubaruResRegistrationOptions,
  type SubaruResRegistrationResult,
  type SubaruResSystemType,
} from "./subaru-res-cm-registration";
import { remedyForDtcCode } from "./dtc-remedies";
import {
  DID_SCAN_FROM,
  DID_SCAN_SILENCE,
  DID_SCAN_TO,
  KNOWN_MODULE_TARGETS,
  MODULE_SCAN_ADDRESSES,
  assessUdsRequest,
  decodeUdsDidSupportBitmap,
  describeCanModule,
  formatUdsPayload,
  isUdsBitmapDid,
  parseKwpDtcs18,
  parseTaggedUdsReplies,
  parseUdsDtcs1902,
  parseUdsResponse,
  resolveDidLabel,
  type ParsedUdsDtc,
  type UdsParsed,
} from "./uds";
import {
  BOOST_DERIVED_PID,
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

export interface ModuleScanItem {
  address: string;
  name: string;
  detail: string;
  responded: boolean;
  txHex: string;
  rxHex: string;
  partNumber?: string | null;
  systemName?: string | null;
  dtcCount?: number | null;
}

export interface SubaruRegionModuleReport {
  txHex: string;
  rxHex: string;
  title: string;
  responded: boolean;
  systemName: string | null;
  partNumber: string | null;
  softwareVersion: string | null;
  calId: string | null;
  dids: { did: string; label: string; hex: string; decoded: string }[];
}

export interface SubaruRegionConfigDump {
  capturedAt: string;
  vin: string | null;
  modules: SubaruRegionModuleReport[];
}

export interface SubaruMeter12ColumnRead {
  capturedAt: string;
  txHex: string;
  rxHex: string;
  vin: string | null;
  dids: { did: string; label: string; hex: string; decoded: string }[];
  match: SubaruDumpCodeMatch;
}

export interface SubaruEyesightVariantRead {
  capturedAt: string;
  txHex: string;
  rxHex: string;
  vin: string | null;
  dids: { did: string; label: string; hex: string; decoded: string }[];
  match: SubaruEyesightVariantMatch;
  steps?: string[];
  cgwFilterRemoved?: boolean;
  securityAccessRequired?: boolean;
}

export interface SubaruMeterEyesightCompareResult {
  capturedAt: string;
  vin: string | null;
  meter: SubaruMeter12ColumnRead;
  eyesight: SubaruEyesightVariantRead;
  compare: SubaruMeterEyesightCompare;
}

export type { SubaruEyesightVariantWriteResult };

export interface SubaruMeter12ColumnWriteSessionResult extends SubaruMeter12ColumnWriteResult {
  before: SubaruMeter12ColumnRead;
  after: SubaruMeter12ColumnRead | null;
}

export interface ModuleDtcItem {
  code: string;
  active: boolean;
  description: string;
  /** Что проверить / типовые шаги устранения */
  remedy?: string;
  statusByte?: number;
}

export interface ModuleDtcReport {
  txHex: string;
  rxHex: string;
  title: string;
  safetyCritical: boolean;
  canSafeClear: boolean;
  responded: boolean;
  systemName: string | null;
  partNumber: string | null;
  diagVersion?: string | null;
  dtcs: ModuleDtcItem[];
  rawStatus: string;
}

export interface ModuleDtcTarget {
  tx: number;
  rx: number;
  title: string;
  safetyCritical: boolean;
  canSafeClear: boolean;
  mode03Fallback?: boolean;
  mitsubishiKwp?: boolean;
}

const FREEZE_PIDS = ["010C", "010D", "0104", "0105", "0111", "0106"];

let sharedObdBleSession: ObdBleSession | null = null;

/**
 * Returns a shared singleton `ObdBleSession` so that opening/closing modals
 * ("Выгрузить с блока" -> editor -> "Загрузить в блок") or navigating between
 * panels in the same tab preserves the active vLinker BLE connection and last read dump.
 */
export function getSharedObdBleSession(): ObdBleSession {
  if (!sharedObdBleSession) {
    sharedObdBleSession = new ObdBleSession();
  }
  return sharedObdBleSession;
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
  private lineMode: "obd" | "monitor" | "uds" = "obd";
  private canProtocol: CanProtocol | null = null;
  private linkLost: (() => void) | null = null;
  private leavePromise: Promise<void> | null = null;
  lastEtacsDump: EtacsCodingDump | null = null;
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
    const raw = await this.udsExchange(
      Number.parseInt(txId, 16),
      rxId ? Number.parseInt(rxId, 16) : undefined,
      request,
    );
    return { raw, parsed: parseUdsResponse(raw, gate.sid) };
  }

  async readEtacsDump(profileId?: string): Promise<EtacsCodingDump> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    const profile = ETACS_PROFILES.find((item) => item.id === profileId) ?? ETACS_PROFILES[0]!;
    const dump = await readEtacsCoding(this.elm!, profile);
    this.lastEtacsDump = dump;
    return dump;
  }

  async writeEtacsBlock(options: {
    profileId?: string;
    kind: "kon" | "cuf";
    payload: Uint8Array;
    overrideLidHex?: string;
  }): Promise<EtacsWriteBlockResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    const profile = ETACS_PROFILES.find((item) => item.id === options.profileId) ?? ETACS_PROFILES[0]!;
    const cachedLid =
      options.overrideLidHex ??
      (this.lastEtacsDump
        ? options.kind === "kon"
          ? this.lastEtacsDump.variantUsedId
          : this.lastEtacsDump.customUsedId
        : undefined);
    return writeEtacsSingleBlock(this.elm!, {
      profile,
      kind: options.kind,
      payload: options.payload,
      overrideLidHex: cachedLid,
    });
  }

  /**
   * Reads Mitsubishi AT (8AT V8AWG / 5AT V5A5A) & CVT (7E1 → 7E9) live telemetry via KWP2000 `21 02` / `21 04` / `21 03`:
   * ATF/CVT temperature (°C), engaged gear (1..8), explicit disengaged gear (P/N) state, shaft RPMs, and damper slip.
   */
  async readSubaruCvtFluidTemp(): Promise<SubaruCvtFluidReading> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readSubaruCvtFluidTemp(this.elm!);
  }

  async readMitsubishiTransmission(): Promise<MitsubishiTcmTelemetry> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readMitsubishiTransmission(this.elm!);
  }

  /**
   * Reads TPMS wheel pressures, temperatures, and 32-bit sensor IDs (4+1 spare wheel)
   * on Mitsubishi Pajero Sport III (`773 → 774`), Outlander/ASX (`600 → 500`), or Subaru SGP (`752 → 75A`).
   */
  async readTpmsSensors(
    target: "mitsubishi-auto" | "mitsubishi-773" | "mitsubishi-600" | "subaru-752" = "mitsubishi-auto",
  ): Promise<TpmsModuleReport> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readTpmsSensors(this.elm!, target);
  }

  /**
   * Mitsubishi TPMS registration. Frames stay inside the matched recipe.
   * The 20 minute window is fixed here. Stopping the poll does not send a cancel.
   */
  async runMitsubishiTpmsRoutine(
    options: Pick<TpmsRoutineOptions, "tx" | "rx" | "recipe" | "modeId" | "shouldStop" | "onProgress">,
  ): Promise<TpmsRoutineResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return runMitsubishiTpmsRoutine(this.elm!, options);
  }

  async readMitsubishiTpmsDidIds(tx: number, rx: number, recipe: TpmsDidRecipe): Promise<Record<string, string | null>> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readMitsubishiTpmsDidIds(this.elm!, tx, rx, recipe);
  }

  async writeMitsubishiTpmsIds(
    tx: number,
    rx: number,
    recipe: TpmsDidRecipe,
    next: Record<string, string | null | undefined>,
  ): Promise<TpmsDidWriteResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return writeMitsubishiTpmsIds(this.elm!, tx, rx, recipe, next);
  }

  /**
   * Reads Mitsubishi Steering Wheel Angle Sensor (`622 → 484` SAS or `784 → 785` ABS/ASC).
   */
  async readMitsubishiSteeringAngle(
    source: "sas-622" | "abs-784" = "sas-622",
  ): Promise<MitsubishiSteeringReport> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readMitsubishiSteeringAngle(this.elm!, source);
  }

  /**
   * Executes Mitsubishi SAS Zero-Point Calibration (`622 → 484`: `10 92` → `31 02` → `31 01` → `10 81`,
   * followed by `784 → 785` ABS/ASC reset `11 01`).
   */
  async calibrateMitsubishiSasZero(): Promise<SasCalibrationResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return calibrateMitsubishiSasZero(this.elm!);
  }

  /**
   * Subaru VDC sensor midpoint / steering-angle zero (7B0 → 7B8 RoutineControl after user confirm).
   */
  async calibrateSubaruSteeringZero(): Promise<SasCalibrationResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return calibrateSubaruSteeringZero(this.elm!);
  }

  /**
   * Executes a Subaru calibration, adaptation, or reset routine from `SUBARU_SERVICE_ACTIONS`.
   */
  async runSubaruServiceAction(actionId: SubaruServiceActionId): Promise<SasCalibrationResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return executeSubaruServiceAction(this.elm!, actionId);
  }

  /**
   * Executes an arbitrary Subaru UDS/SSM4 Work Support, Active Test, or Cancel Code sequence.
   */
  async runSubaruUdsProcedure(options: {
    txHex: string;
    rxHex: string;
    payloads: readonly string[];
    stopOnWriteSuccess?: boolean;
    requireCgwFilterRemove?: boolean;
    autoSecurityAccess?: boolean;
    preferEcuKinds?: readonly number[];
  }): Promise<SubaruUdsProcedureResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return executeSubaruUdsProcedure(this.elm!, options);
  }

  /**
   * Reads Mitsubishi Combination Meter (`6A0 → 514`) fuel level in liters (`21 A3`) and odometer (`21 AD`).
   */
  async readMitsubishiMeter(): Promise<MitsubishiMeterReport> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) await this.elm!.stopMonitor();
    await this.ensureUdsProfile("6");
    return readMitsubishiMeter(this.elm!);
  }

  async scanModules(
    protocol: CanProtocol,
    request: "10 01" | "3E 00",
    onProgress: (address: string, detail: string, item?: ModuleScanItem) => void,
    options?: { preset?: "standard" | "extended" | "wide"; shouldStop?: () => boolean },
  ): Promise<void> {
    const gate = assessUdsRequest(request, false);
    if (!gate.ok) throw new Error(gate.message);
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед сканером");
    await this.ensureUdsProfile(protocol);

    const targets: { tx: number; rx?: number }[] =
      options?.preset === "wide"
        ? Array.from({ length: 0x7e8 - 0x700 }, (_, i) => ({ tx: 0x700 + i }))
        : options?.preset === "extended"
          ? KNOWN_MODULE_TARGETS.map((t) => ({ tx: t.tx, rx: t.rx }))
          : MODULE_SCAN_ADDRESSES.map((tx) => ({ tx }));

    const wide = options?.preset === "wide";
    // Turn headers and spaces on during scan so a 7DF reply or physical probe reveals the responder's CAN ID.
    try {
      await this.elm!.sendCommand("ATH1");
      await this.elm!.sendCommand("ATS1");
      if (wide) await this.elm!.sendCommand("ATST20");
    } catch {
      /* clone keeps defaults */
    }

    try {
      for (const target of targets) {
        if (options?.shouldStop?.()) return;
        const address = target.tx;
        const label = address.toString(16).toUpperCase();
        const meta = describeCanModule(address);
        onProgress(label, "запрос", {
          address: label,
          name: meta.name,
          detail: "запрос…",
          responded: false,
          txHex: meta.txHex,
          rxHex: target.rx ? target.rx.toString(16).toUpperCase() : meta.rxHex,
        });

        let detail = "нет ответа";
        let responded = false;
        let resolvedName = meta.name;
        let resolvedTx = meta.txHex;
        let resolvedRx = target.rx ? target.rx.toString(16).toUpperCase() : meta.rxHex;
        let partNumber: string | null = null;
        let systemName: string | null = null;

        try {
          let raw = await this.udsExchange(address, target.rx, request, wide ? 1_000 : 2_200);
          let tagged = parseTaggedUdsReplies(raw, gate.sid);
          // Many Subaru / Mitsubishi ECUs (especially TCM 7E1 or KWP 620/6A0/773/600/622/784) stay silent on 3E 00 until 10 03 / 10 92 is sent.
          if (tagged.length === 0 && !wide && address !== 0x7df) {
            raw = await this.udsExchange(address, target.rx, "1003", 1_500);
            tagged = parseTaggedUdsReplies(raw, 0x10);
            if (tagged.length === 0) {
              raw = await this.udsExchange(address, target.rx, "1092", 1_500);
              tagged = parseTaggedUdsReplies(raw, 0x10);
            }
            if (tagged.length === 0 && (address === 0x7e0 || address === 0x7e1)) {
              raw = await this.udsExchange(address, target.rx, "0904", 1_800);
              tagged = parseTaggedUdsReplies(raw, 0x09);
            }
          }
          if (tagged.length > 0) {
            responded = true;
            const parts: string[] = [];
            for (const reply of tagged) {
              const rxInfo = reply.rxAddress != null ? describeCanModule(reply.rxAddress) : null;
              if (rxInfo && address !== 0x7df) {
                resolvedName = rxInfo.name;
                resolvedTx = rxInfo.txHex;
                resolvedRx = rxInfo.rxHex;
              }
              const tagPrefix =
                reply.rxAddress != null
                  ? `${reply.rxAddress.toString(16).toUpperCase()} (${rxInfo?.name ?? "блок"}): `
                  : "";
              const status =
                reply.parsed.kind === "positive"
                  ? "ответил"
                  : `ответил (NRC ${reply.parsed.nrcText ?? ""})`.trim();
              parts.push(`${tagPrefix}${status}`);
            }
            detail = parts.join("; ");
            if (address === 0x7df && tagged.length > 1) {
              resolvedName = `Широковещательный 7DF (ответило блоков: ${tagged.length})`;
              const nonEngine = tagged.find((r) => r.rxAddress != null && r.rxAddress !== 0x7e8);
              const pick = nonEngine ?? tagged[0]!;
              if (pick.rxAddress != null) {
                const info = describeCanModule(pick.rxAddress);
                resolvedTx = info.txHex;
                resolvedRx = info.rxHex;
              }
            }

            // Launch-style passport enrichment for physical modules: fetch OEM Part# (22 F18E / F187) and System Name (22 F197)
            if (!wide && address !== 0x7df) {
              try {
                // Temporarily disable ATH1 so multi-frame ISO-TP strings (22 F197 / 22 F18E) never mix CAN ID nibbles into ASCII
                await this.elm!.sendCommand("ATH0");
                const pRaw = await this.udsExchange(address, target.rx, "22F18E", 1_100);
                const pParsed = parseUdsResponse(pRaw, 0x22);
                if (pParsed.kind === "positive" && pParsed.payload.length > 2) {
                  const ascii = pParsed.payload
                    .slice(2)
                    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
                    .join("")
                    .trim();
                  if (ascii.length >= 4 && !/^0+$/.test(ascii)) partNumber = ascii;
                }
                const sRaw = await this.udsExchange(address, target.rx, "22F197", 1_100);
                const sParsed = parseUdsResponse(sRaw, 0x22);
                if (sParsed.kind === "positive" && sParsed.payload.length > 2) {
                  const ascii = sParsed.payload
                    .slice(2)
                    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
                    .join("")
                    .trim();
                  if (ascii.length >= 3) systemName = ascii;
                }
                if (!partNumber && (address === 0x7e0 || address === 0x7e1)) {
                  const cRaw = await this.udsExchange(address, target.rx, "0904", 1_500);
                  const cParsed = parseUdsResponse(cRaw, 0x09);
                  if (cParsed.kind === "positive" && cParsed.payload.length > 2) {
                    const ascii = cParsed.payload
                      .slice(2)
                      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                      .join("")
                      .replace(/\s+/g, " ")
                      .trim();
                    if (ascii.length >= 4) partNumber = `CalID: ${ascii}`;
                  }
                }
              } catch {
                /* optional enrichment */
              } finally {
                try {
                  await this.elm!.sendCommand("ATH1");
                } catch {
                  /* ignore */
                }
              }
              // Return module to default session (10 01) so ABS/VDC/EyeSight warning lights turn off immediately
              try {
                await this.udsExchange(address, target.rx, "1001", 900);
              } catch {
                /* ignore */
              }
            }
          } else {
            const compact = raw.replace(/>/g, "").replace(/\s+/g, " ").trim();
            detail = compact ? compact.slice(0, 80) : "нет ответа";
          }
        } catch (error) {
          detail = error instanceof Error ? error.message : "ошибка";
        }

        const extra: string[] = [];
        if (systemName) extra.push(systemName);
        if (partNumber) extra.push(`№ ${partNumber}`);
        if (extra.length > 0) {
          detail = `${detail} · ${extra.join(" · ")}`;
        }

        onProgress(label, detail, {
          address: label,
          name: systemName ? `${resolvedName} (${systemName})` : resolvedName,
          detail,
          responded,
          txHex: resolvedTx,
          rxHex: resolvedRx,
          partNumber,
          systemName,
        });
        if (!wide) {
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      }
    } finally {
      try {
        await this.elm!.sendCommand("ATH0");
        await this.elm!.sendCommand("ATS0");
        if (wide) await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }
  }

  /** Service 22 over F180–F1FF on the selected ECU. Stops after a long run of NO DATA. */
  async scanIdentificationDids(
    protocol: CanProtocol,
    tx: string,
    rx: string,
    onProgress: (done: number, total: number, hit: { did: string; text: string } | null) => void,
    shouldStop: () => boolean,
    range?: { from: number; to: number; stopOnSilence?: boolean },
  ): Promise<void> {
    const txId = normalizeCanToken(tx, protocol);
    const rxId = rx.trim() ? normalizeCanToken(rx, protocol) : null;
    if (!txId) throw new Error("Нужен адрес запроса TX");
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед сканером");
    await this.ensureUdsProfile(protocol);
    const fromDid = range?.from ?? DID_SCAN_FROM;
    const toDid = range?.to ?? DID_SCAN_TO;
    const stopOnSilence = range?.stopOnSilence ?? true;
    try {
      await this.elm!.sendCommand("ATST20");
      // Open extended diagnostic session (10 03) first so 2020+ Subaru/Mitsubishi ECUs unlock live & ID DIDs.
      await this.udsExchange(
        Number.parseInt(txId, 16),
        rxId ? Number.parseInt(rxId, 16) : undefined,
        "1003",
        1_200,
      );
    } catch {
      /* clone keeps the previous timeout */
    }
    const total = toDid - fromDid + 1;
    let done = 0;
    let silence = 0;
    const txNum = Number.parseInt(txId, 16);
    const rxNum = rxId ? Number.parseInt(rxId, 16) : undefined;
    try {
      const visited = new Set<number>();
      for (let did = fromDid; did <= toDid; did++) {
        if (shouldStop()) return;
        if (visited.has(did)) continue;
        visited.add(did);
        // Send TesterPresent (3E 00) every 12 DIDs so extended session 10 03 never times out during a scan
        if (done > 0 && done % 12 === 0) {
          try {
            await this.udsExchange(txNum, rxNum, "3E00", 800);
          } catch {
            /* ignore */
          }
        }
        const request = `22${did.toString(16).padStart(4, "0").toUpperCase()}`;
        let hit: { did: string; text: string } | null = null;
        try {
          const raw = await this.udsExchange(txNum, rxNum, request, 1_100);
          const parsed = parseUdsResponse(raw, 0x22);
          if (parsed.kind === "positive") {
            silence = 0;
            // Skip echoed 2-byte DID if present
            const body =
              parsed.payload.length >= 2 &&
              parsed.payload[0] === ((did >> 8) & 0xff) &&
              parsed.payload[1] === (did & 0xff)
                ? parsed.payload.slice(2)
                : parsed.payload;
            const didHex = request.slice(2);
            const label = resolveDidLabel(didHex, txId);
            const formatted = formatUdsPayload(parsed.payload, 0x22, txId);
            hit = { did: label ? `${didHex} · ${label}` : didHex, text: formatted };
            done += 1;
            onProgress(done, total, hit);

            // If this DID is a 32-bit support bitmap (e.g. 1000, 1020, 1100, 2100), probe only the supported DIDs in its 32-DID block
            if (isUdsBitmapDid(did) && body.length === 4) {
              const supported = new Set(decodeUdsDidSupportBitmap(did, body));
              for (let offset = 1; offset <= 32 && did + offset <= toDid; offset++) {
                const subDid = did + offset;
                if (!supported.has(subDid)) {
                  visited.add(subDid);
                  done += 1;
                }
              }
            }
            continue;
          } else if (parsed.kind === "negative") {
            silence = 0;
          } else if (stopOnSilence && ++silence >= DID_SCAN_SILENCE) {
            throw new Error(`Блок молчит (${silence} подряд без ответа). Проверьте адреса и зажигание.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (/молчит/i.test(message)) throw error;
          if (stopOnSilence && ++silence >= DID_SCAN_SILENCE) {
            throw new Error(`Блок молчит (${silence} подряд без ответа). Проверьте адреса и зажигание.`);
          }
        }
        done += 1;
        onProgress(done, total, hit);
      }
    } finally {
      try {
        // Return ECU to default session (10 01) so ABS/VDC/EyeSight warning lights turn off immediately
        await this.udsExchange(txNum, rxNum, "1001", 800);
      } catch {
        /* ignore */
      }
      try {
        await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Strictly READ-ONLY (UDS Service 22 + TesterPresent 3E 00 + Session 10 03/10 01)
   * reader for Subaru Combination Meter (783 / 7C0), EyeSight (787 / 784), BIU (740), and Climate (7C4).
   * Never sends 27 (SecurityAccess), 2E (WriteDataByIdentifier), 31 (RoutineControl), or 11 (ECUReset).
   */
  async readSubaruMeterEyesightConfig(
    protocol: CanProtocol,
    onProgress?: (status: string, partial: SubaruRegionModuleReport[]) => void,
    shouldStop?: () => boolean,
  ): Promise<SubaruRegionConfigDump> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед выгрузкой");
    await this.ensureUdsProfile(protocol);

    const targets: { tx: number; rx: number; title: string }[] = [
      { tx: 0x7a2, rx: 0x7aa, title: "Силовая установка 2.4 TURBO / КПП SGP (7A2 → 7AA)" },
      { tx: 0x7e1, rx: 0x7e9, title: "Коробка передач / Вариатор CVT OBD (7E1 → 7E9)" },
      { tx: 0x783, rx: 0x78b, title: "Приборка SGP (METER 783 → 78B)" },
      { tx: 0x752, rx: 0x75a, title: "Боди-модуль BIU / TPMS (Integ. Unit 752 → 75A)" },
      { tx: 0x787, rx: 0x78f, title: "Камера EyeSight SGP (787 → 78F)" },
      { tx: 0x7c4, rx: 0x7cc, title: "Климат-контроль A/C (7C4 → 7CC)" },
      { tx: 0x786, rx: 0x78e, title: "Сонары / Парктроник RAB (786 → 78E)" },
      { tx: 0x7b0, rx: 0x7b8, title: "ABS / VDC / Ручник EPB (7B0 → 7B8)" },
      { tx: 0x746, rx: 0x74e, title: "Электроусилитель руля EPS (746 → 74E)" },
      { tx: 0x780, rx: 0x788, title: "Подушки безопасности SRS Airbag (780 → 788)" },
    ];

    const passportDids = [
      0xf182, 0xf186, 0xf187, 0xf188, 0xf189, 0xf18a, 0xf18b, 0xf18c, 0xf18e, 0xf190, 0xf191,
      0xf192, 0xf193, 0xf194, 0xf195, 0xf197, 0xf198, 0xf199, 0xf19e,
      0xf1a0, 0xf1a1, 0xf1a2, 0xf1a3, 0xf1a4, 0xf1b0, 0xf1c0, 0xf1d0,
    ];

    const meterVariantDids = [
      0x0250, 0x0251, 0xa000, 0xa001, 0xa002, 0xa007, 0xa011, 0xa016, 0xa020, 0xa024, 0xa027, 0xa028,
      0x0240, 0x0200, 0x0220, 0x0100,
    ];

    const rootBitmaps = [0x1000, 0x1100, 0x1200, 0x2000, 0x2100, 0x3000, 0x3100, 0x3200, 0xd000];

    let vin: string | null = null;
    const reports: SubaruRegionModuleReport[] = [];

    try {
      await this.elm!.sendCommand("ATST20");
    } catch {
      /* ignore */
    }

    try {
      for (const target of targets) {
        if (shouldStop?.()) break;
        const txHex = target.tx.toString(16).toUpperCase();
        const rxHex = target.rx.toString(16).toUpperCase();
        onProgress?.(`Опрос ${target.title}…`, [...reports]);

        let responded = false;
        let sessionOpened = false;

        try {
          const raw3e = await this.udsExchange(target.tx, target.rx, "3E00", 800);
          if (parseUdsResponse(raw3e, 0x3e).kind !== "empty") {
            responded = true;
          }
        } catch {
          /* ignore */
        }

        try {
          const raw10 = await this.udsExchange(target.tx, target.rx, "1003", 900);
          const p10 = parseUdsResponse(raw10, 0x10);
          if (p10.kind !== "empty") {
            responded = true;
            if (p10.kind === "positive") sessionOpened = true;
          }
        } catch {
          /* ignore */
        }

        // Powertrain modules (7E0/7E1) sometimes ignore 3E 00 / 10 03 in default mode but answer 09 04 (CalID) or 22 F190
        let mode09CalId: string | null = null;
        if (!responded && (target.tx === 0x7e1 || target.tx === 0x7e0)) {
          try {
            const raw09 = await this.udsExchange(target.tx, target.rx, "0904", 1_200);
            const p09 = parseUdsResponse(raw09, 0x09);
            if (p09.kind === "positive") {
              responded = true;
              mode09CalId = formatUdsPayload(p09.payload, 0x09);
            }
          } catch {
            /* ignore */
          }
        }

        const dids: { did: string; label: string; hex: string; decoded: string }[] = [];
        let systemName: string | null = null;
        let partNumber: string | null = null;
        let softwareVersion: string | null = null;
        let calId: string | null = mode09CalId;

        if (responded) {
          let step = 0;
          const visited = new Set<number>();
          const emptyHops = new Map<number, number>();
          const eyesightVariantDids = SUBARU_EYESIGHT_VARIANT_READ_DIDS.map((h) =>
            Number.parseInt(h, 16),
          );
          const queue: number[] =
            target.tx === 0x783 || target.tx === 0x7c0 || target.tx === 0x752
              ? [...meterVariantDids, ...passportDids, ...rootBitmaps]
              : target.tx === 0x787
                ? [...eyesightVariantDids, ...passportDids, ...rootBitmaps]
                : [...passportDids, ...rootBitmaps];

          while (queue.length > 0) {
            if (shouldStop?.()) break;
            const didNum = queue.shift()!;
            if (visited.has(didNum)) continue;
            visited.add(didNum);

            step += 1;
            if (step % 8 === 0) {
              try {
                await this.udsExchange(target.tx, target.rx, "3E00", 700);
              } catch {
                /* ignore */
              }
            }
            const didHex = didNum.toString(16).padStart(4, "0").toUpperCase();
            try {
              const raw22 = await this.udsExchange(target.tx, target.rx, `22${didHex}`, 900);
              const parsed = parseUdsResponse(raw22, 0x22);
              if (parsed.kind === "positive") {
                const body =
                  parsed.payload.length >= 2 &&
                  parsed.payload[0] === ((didNum >> 8) & 0xff) &&
                  parsed.payload[1] === (didNum & 0xff)
                    ? parsed.payload.slice(2)
                    : parsed.payload;
                const hex = body.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
                const decoded = formatUdsPayload(parsed.payload, 0x22, txHex);
                const ascii = body
                  .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                  .join("")
                  .replace(/\s+/g, " ")
                  .trim();

                const isBitmap = isUdsBitmapDid(didNum) && body.length === 4;
                const children = isBitmap ? decodeUdsDidSupportBitmap(didNum, body) : [];
                const dataChildren = children.filter((c) => !isUdsBitmapDid(c));
                const isEmptyOrPointerOnlyBitmap = isBitmap && dataChildren.length === 0;

                if (!isEmptyOrPointerOnlyBitmap) {
                  const label = resolveDidLabel(didHex, txHex) ?? `DID ${didHex}`;
                  dids.push({ did: didHex, label, hex, decoded });
                }
                if (didHex === "F197" && ascii) systemName = ascii;
                if ((didHex === "F18E" || didHex === "F187") && ascii && !/^0+$/.test(ascii)) partNumber = ascii;
                if ((didHex === "F189" || didHex === "F195") && ascii) softwareVersion = ascii;
                if (didHex === "F182") calId = ascii || hex;
                if (didHex === "F190" && ascii.length >= 11) vin = ascii;

                // If this DID is a 32-bit support bitmap (e.g. 1000, 1020, 1100, 2100), enqueue all supported child DIDs
                if (isBitmap) {
                  const prevEmpty = emptyHops.get(didNum) ?? 0;
                  const nextEmpty = dataChildren.length === 0 ? prevEmpty + 1 : 0;
                  for (const childDid of children) {
                    if (isUdsBitmapDid(childDid) && nextEmpty > 2) continue;
                    if (isUdsBitmapDid(childDid)) {
                      emptyHops.set(childDid, nextEmpty);
                    }
                    if (!visited.has(childDid) && dids.length + queue.length < 180) {
                      queue.push(childDid);
                    }
                  }
                }
              }
            } catch {
              /* ignore */
            }
          }

          if (sessionOpened) {
            try {
              await this.udsExchange(target.tx, target.rx, "1001", 700);
            } catch {
              /* ignore */
            }
          }
        }

        reports.push({
          txHex,
          rxHex,
          title: target.title,
          responded: responded || dids.length > 0,
          systemName,
          partNumber,
          softwareVersion,
          calId,
          dids,
        });
        onProgress?.(`Проверен ${target.title}`, [...reports]);
      }
    } finally {
      try {
        await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }

    return {
      capturedAt: new Date().toISOString(),
      vin,
      modules: reports,
    };
  }

  /**
   * Read-only (UDS 22 only) capture of Combination Meter 12-column Applied Model + Option Code.
   * Never sends 2E / 27 / 31 / writeCommonArea.
   */
  async readSubaruMeter12ColumnCode(
    protocol: CanProtocol = "6",
  ): Promise<SubaruMeter12ColumnRead> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед чтением приборки");
    await this.ensureUdsProfile(protocol);

    const targets: { tx: number; rx: number }[] = [
      { tx: 0x783, rx: 0x78b },
      { tx: 0x7c0, rx: 0x7c8 },
    ];

    let vin: string | null = null;
    let usedTx = 0x783;
    let usedRx = 0x78b;
    const dids: { did: string; label: string; hex: string; decoded: string }[] = [];

    try {
      await this.elm!.sendCommand("ATST20");
    } catch {
      /* ignore */
    }

    try {
      for (const target of targets) {
        const txHex = target.tx.toString(16).toUpperCase();
        try {
          await this.udsExchange(target.tx, target.rx, "3E00", 800);
          await this.udsExchange(target.tx, target.rx, "1003", 900);
        } catch {
          /* ignore */
        }

        let gotPositive = false;
        const fpDidSet = new Set<string>(SUBARU_METER_ALL_VARIANT_A0XX_DIDS as unknown as string[]);
        const queue: string[] = [...SUBARU_METER_12COLUMN_READ_DIDS];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const didHex = queue.shift()!.toUpperCase();
          if (visited.has(didHex)) continue;
          visited.add(didHex);
          try {
            const raw22 = await this.udsExchange(target.tx, target.rx, `22${didHex}`, 900);
            const parsed = parseUdsResponse(raw22, 0x22);
            if (parsed.kind !== "positive") {
              // Absent fingerprint DID is part of the catalog row (e.g. A02E missing on BTAEYR8).
              if (fpDidSet.has(didHex)) {
                dids.push({
                  did: didHex,
                  label: resolveDidLabel(didHex, txHex) ?? `DID ${didHex}`,
                  hex: "--",
                  decoded: "отсутствует в приборке (NRC / нет ответа)",
                });
              }
              continue;
            }
            gotPositive = true;
            const didNum = Number.parseInt(didHex, 16);
            const body =
              parsed.payload.length >= 2 &&
              parsed.payload[0] === ((didNum >> 8) & 0xff) &&
              parsed.payload[1] === (didNum & 0xff)
                ? parsed.payload.slice(2)
                : parsed.payload;
            const hex = body.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
            const decoded = formatUdsPayload(parsed.payload, 0x22, txHex);
            dids.push({
              did: didHex,
              label: resolveDidLabel(didHex, txHex) ?? `DID ${didHex}`,
              hex,
              decoded,
            });
            if ((didNum === 0xa000 || didNum === 0xa020 || didNum === 0xa040) && body.length === 4) {
              const supported = decodeUdsDidSupportBitmap(didNum, body);
              for (const childDid of supported) {
                const childHex = childDid.toString(16).padStart(4, "0").toUpperCase();
                if (!visited.has(childHex)) queue.push(childHex);
              }
            }
            if (didHex === "F190") {
              const ascii = body
                .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
                .join("")
                .trim();
              if (ascii.length >= 11) vin = ascii;
            }
          } catch {
            if (fpDidSet.has(didHex)) {
              dids.push({
                did: didHex,
                label: resolveDidLabel(didHex, txHex) ?? `DID ${didHex}`,
                hex: "--",
                decoded: "отсутствует в приборке (ошибка чтения)",
              });
            }
          }
        }

        if (gotPositive) {
          usedTx = target.tx;
          usedRx = target.rx;
          try {
            await this.udsExchange(target.tx, target.rx, "1001", 700);
          } catch {
            /* ignore */
          }
          break;
        }
      }

      if (!vin) {
        for (const vinTarget of [
          { tx: 0x7e0, rx: 0x7e8 },
          { tx: 0x7a2, rx: 0x7aa },
          { tx: 0x752, rx: 0x75a },
        ]) {
          try {
            const rawVin = await this.udsExchange(vinTarget.tx, vinTarget.rx, "22F190", 900);
            const parsedVin = parseUdsResponse(rawVin, 0x22);
            if (parsedVin.kind === "positive") {
              const body =
                parsedVin.payload.length >= 2 &&
                parsedVin.payload[0] === 0xf1 &&
                parsedVin.payload[1] === 0x90
                  ? parsedVin.payload.slice(2)
                  : parsedVin.payload;
              const ascii = body
                .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
                .join("")
                .trim();
              if (ascii.length >= 11) {
                vin = ascii;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
      if (!vin) {
        try {
          const raw0902 = await this.udsExchange(0x7e0, 0x7e8, "0902", 1_100);
          const parsed0902 = parseMode09Ascii(raw0902, 0x02);
          if (parsed0902 && parsed0902.length >= 11) {
            vin = parsed0902;
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      try {
        await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }

    const match = extractAppliedModelAndOptionCodeFromDump({
      vin,
      modules: [
        {
          txHex: usedTx.toString(16).toUpperCase(),
          dids,
        },
      ],
    });

    return {
      capturedAt: new Date().toISOString(),
      txHex: usedTx.toString(16).toUpperCase(),
      rxHex: usedRx.toString(16).toUpperCase(),
      vin,
      dids,
      match,
    };
  }

  /**
   * Read-only EyeSight (787 / 784) variant DIDs 3501..3510 (ADA-032 Confirm on Parameter, Y-YwPHBWHoZ.mLW).
   * Never writes. Used to compare stereo-camera coding vs Combination Meter.
   */
  async readSubaruEyesightVariantCode(
    protocol: CanProtocol = "6",
    hintAppliedModel?: string | null,
    securityKeyHex?: string,
  ): Promise<SubaruEyesightVariantRead> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед чтением EyeSight");
    await this.ensureUdsProfile(protocol);

    const dids: { did: string; label: string; hex: string; decoded: string }[] = [];
    let vin: string | null = null;
    let txHex = "787";
    let rxHex = "78F";
    const steps: string[] = [];
    let cgwFilterRemoved = false;
    let securityAccessRequired = false;

    try {
      await this.elm!.sendCommand("ATST20");
    } catch {
      /* ignore */
    }

    try {
      const probe = await readSubaruEyesight35xxDids(this.elm!, {
        steps,
        withCgw: true,
        didHexList: SUBARU_EYESIGHT_VARIANT_READ_DIDS,
        securityKeyHex,
        unlockIfNrc33: true,
      });

      cgwFilterRemoved = probe.cgwFilterRemoved;
      securityAccessRequired = probe.securityAccessRequired;
      txHex = probe.tx.toString(16).toUpperCase();
      rxHex = probe.rx.toString(16).toUpperCase();
      const activeTxHex = txHex;

      for (const didHex of SUBARU_EYESIGHT_VARIANT_READ_DIDS) {
        const rawHex = probe.didMap[didHex.toUpperCase()];
        if (!rawHex) {
          if ((SSM4_YYW_FP_DID_KEYS as readonly string[]).includes(didHex.toUpperCase())) {
            dids.push({
              did: didHex,
              label: resolveDidLabel(didHex, activeTxHex) ?? `DID ${didHex}`,
              hex: "--",
              decoded: probe.cgwFilterRemoved
                ? "нет ответа (NRC / не поддерживается)"
                : "нет ответа — возможно нужен CGW FilterRemove",
            });
          }
          continue;
        }
        const body = rawHex
          .trim()
          .split(/\s+/)
          .map((h) => Number.parseInt(h, 16));
        const hex = rawHex;
        const didNum = Number.parseInt(didHex, 16);
        const decoded = formatUdsPayload(
          [((didNum >> 8) & 0xff), didNum & 0xff, ...body],
          0x22,
          activeTxHex,
        );
        dids.push({
          did: didHex,
          label: resolveDidLabel(didHex, activeTxHex) ?? `DID ${didHex}`,
          hex,
          decoded,
        });
        if (didHex === "F190") {
          const ascii = body
            .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
            .join("")
            .trim();
          if (ascii.length >= 11) vin = ascii;
        }
      }
    } finally {
      try {
        await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }

    const match = extractEyesightVariantFromDids(dids, hintAppliedModel);
    return {
      capturedAt: new Date().toISOString(),
      txHex,
      rxHex,
      vin,
      dids,
      match,
      steps,
      cgwFilterRemoved,
      securityAccessRequired,
    };
  }

  /** Read meter + EyeSight variants and compare Option Code / region. */
  async readSubaruMeterEyesightVariantCompare(
    protocol: CanProtocol = "6",
    securityKeyHex?: string,
  ): Promise<SubaruMeterEyesightCompareResult> {
    const meter = await this.readSubaruMeter12ColumnCode(protocol);
    const eyesight = await this.readSubaruEyesightVariantCode(
      protocol,
      meter.match.actualAppliedModel,
      securityKeyHex,
    );
    const compare = compareMeterAndEyesightVariants(meter.match, eyesight.match);
    return {
      capturedAt: new Date().toISOString(),
      vin: meter.vin ?? eyesight.vin,
      meter,
      eyesight,
      compare,
    };
  }

  /**
   * Procedure B only: UDS 2E on Combination Meter DID 0250/0251 or MET-002/009 A0xx (`sendMetVariByApplied`).
   * Reads current layout first, writes Applied+Option (two-did, full-cgdw, or custom-a0xx backup), then re-reads. Never writeCommonArea.
   */
  async writeSubaruMeter12ColumnCode(
    appliedModel: string,
    optionCode: string,
    protocol: CanProtocol = "6",
    securityKeyHex?: string,
    options?: {
      writeMode?: SubaruMeterWriteMode;
      customA0xxWrites?: SubaruMeterA0xxWriteEntry[];
    },
  ): Promise<SubaruMeter12ColumnWriteSessionResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед записью приборки");
    await this.ensureUdsProfile(protocol);

    const before = await this.readSubaruMeter12ColumnCode(protocol);
    const write = await executeSubaruMeter12ColumnWrite(this.elm!, {
      appliedModel,
      optionCode,
      currentDids: before.dids,
      txHex: before.txHex,
      rxHex: before.rxHex,
      securityKeyHex,
      writeMode: options?.writeMode,
      customA0xxWrites: options?.customA0xxWrites,
    });


    let after: SubaruMeter12ColumnRead | null = null;
    try {
      after = await this.readSubaruMeter12ColumnCode(protocol);
    } catch {
      /* write result still stands */
    }

    return { ...write, before, after };
  }

  /**
   * SSM4 EyeSight Work Support → Selection of Parameter (`ADA-031.srp`): `2E 35 01..10` from Y-Yw.
   */
  async writeSubaruEyesightVariantCode(
    appliedModel: string,
    optionCode: string,
    protocol: CanProtocol = "6",
    securityKeyHex?: string,
    options?: {
      writeMode?: SubaruEyesightWriteMode;
      customWrites?: SubaruEyesightWriteEntry[];
      txHex?: string;
      rxHex?: string;
    },
  ): Promise<SubaruEyesightVariantWriteResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед записью EyeSight");
    await this.ensureUdsProfile(protocol);
    return writeSubaruEyesightVariantByApplied(
      this.elm!,
      appliedModel,
      optionCode,
      securityKeyHex,
      options,
    );
  }

  /**
   * Read-only probe before SSM4 F2 «Remote Engine Start CM Registration» (Keyless 750 + BIU 752).
   */
  async probeSubaruResCm(protocol: CanProtocol = "6"): Promise<SubaruResProbeResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед опросом RES CM");
    await this.ensureUdsProfile(protocol);
    return executeSubaruResCmProbe(this.elm!);
  }

  /**
   * SSM4 RES CM Registration (`IMM-071` / `IMM-017` `2E 11 B0 01` or `IMM-005`/`064` `31 01 40 05`).
   */
  async registerSubaruResCm(
    protocol: CanProtocol = "6",
    options?: SubaruResRegistrationOptions,
  ): Promise<SubaruResRegistrationResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед пропиской RES CM");
    await this.ensureUdsProfile(protocol);
    return executeSubaruResCmRegister(this.elm!, options);
  }

  /**
   * Executes a vehicle-bound Mitsubishi MUT-III SE service procedure (reset, calibration, learning, actuator test)
   * after verifying that `skey` and `txCanId -> rxCanId` belong to the diagnosed vehicle's ECU.
   */
  async runMitsubishiServiceProcedure(options: {
    procedureId: string;
    skey: string;
    txCanId: string;
    rxCanId: string;
  }): Promise<MitsubishiServiceExecutionResult> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед выполнением сервисной процедуры");
    await this.ensureUdsProfile("6");
    return executeMitsubishiServiceProcedure(this.elm!, options);
  }

  /**
   * Reads DTCs across all major vehicle ECUs (OBD Mode 03 on 7E0/7E1 + UDS Service 19 02 FF on SGP/Mitsubishi modules).
   * Always returns every module to default session `10 01` afterwards so warning lamps extinguish.
   */
  async scanCatalogModules(
    protocol: CanProtocol,
    catalogTargets: ModuleDtcTarget[],
    onProgress?: (status: string, partial: ModuleDtcReport[]) => void,
    shouldStop?: () => boolean,
  ): Promise<ModuleDtcReport[]> {
    return this.scanAllModuleDtcs(protocol, onProgress, shouldStop, catalogTargets);
  }

  async scanAllModuleDtcs(
    protocol: CanProtocol,
    onProgress?: (status: string, partial: ModuleDtcReport[]) => void,
    shouldStop?: () => boolean,
    catalogTargets?: ModuleDtcTarget[],
    onlyBrand?: "subaru" | "mitsubishi",
  ): Promise<ModuleDtcReport[]> {
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед чтением ошибок");
    await this.ensureUdsProfile(protocol);

    const targets: ModuleDtcTarget[] = catalogTargets?.length
      ? catalogTargets
      : [
      {
        tx: 0x7e0,
        rx: 0x7e8,
        title: "Двигатель ECM (7E0 → 7E8)",
        safetyCritical: false,
        canSafeClear: true,
        mode03Fallback: true,
      },
      {
        tx: 0x7e1,
        rx: 0x7e9,
        title: "Коробка передач / Вариатор CVT (7E1 → 7E9)",
        safetyCritical: false,
        canSafeClear: true,
        mode03Fallback: true,
      },
      {
        tx: 0x7a3,
        rx: 0x7ab,
        title: "Вариатор Lineartronic TCM SGP (7A3 → 7AB)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x7a2,
        rx: 0x7aa,
        title: "Силовая установка 2.4 TURBO SGP (7A2 → 7AA)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x783,
        rx: 0x78b,
        title: "Приборка METER (783 → 78B)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x752,
        rx: 0x75a,
        title: "Боди-модуль BIU / TPMS (752 → 75A)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x7c4,
        rx: 0x7cc,
        title: "Климат-контроль A/C (7C4 → 7CC)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x786,
        rx: 0x78e,
        title: "Сонары / Парктроник RAB (786 → 78E)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x746,
        rx: 0x74e,
        title: "Электроусилитель руля EPS (746 → 74E)",
        safetyCritical: true,
        canSafeClear: false,
      },
      {
        tx: 0x787,
        rx: 0x78f,
        title: "Камера и ассистенты EyeSight (787 → 78F)",
        safetyCritical: true,
        canSafeClear: false,
      },
      {
        tx: 0x7b0,
        rx: 0x7b8,
        title: "Тормоза ABS / VDC / Электроручник EPB (7B0 → 7B8)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x780,
        rx: 0x788,
        title: "Подушки безопасности SRS Airbag (780 → 788)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x620,
        rx: 0x504,
        title: "Mitsubishi ETACS Боди-модуль (620 → 504)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x6a0,
        rx: 0x514,
        title: "Mitsubishi Приборная панель Meter (6A0 → 514)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x773,
        rx: 0x774,
        title: "Mitsubishi Давление в шинах TPMS / OSS (773 → 774)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x600,
        rx: 0x500,
        title: "Mitsubishi Бесключевой доступ KOS / TPMS (600 → 500)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x622,
        rx: 0x484,
        title: "Mitsubishi Датчик угла руля SAS (622 → 484)",
        safetyCritical: true,
        canSafeClear: false,
      },
      {
        tx: 0x784,
        rx: 0x785,
        title: "Mitsubishi Тормоза ABS / ASC (784 → 785)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x6e0,
        rx: 0x51c,
        title: "Mitsubishi Подушки безопасности SRS (6E0 → 51C)",
        safetyCritical: false,
        canSafeClear: true,
      },
      {
        tx: 0x688,
        rx: 0x511,
        title: "Mitsubishi Климат-контроль A/C (688 → 511)",
        safetyCritical: false,
        canSafeClear: true,
      },
    ].filter((target) => {
      if (!onlyBrand) return true;
      const subaruTx = new Set([
        0x7e0, 0x7e1, 0x7a3, 0x7a2, 0x783, 0x752, 0x7c4, 0x786, 0x746, 0x787, 0x7b0, 0x780,
      ]);
      const mitsubishiTx = new Set([
        0x7e0, 0x7e1, 0x620, 0x6a0, 0x773, 0x600, 0x622, 0x784, 0x6e0, 0x688,
      ]);
      return (onlyBrand === "subaru" ? subaruTx : mitsubishiTx).has(target.tx);
    });

    const out: ModuleDtcReport[] = [];
    try {
      await this.elm!.sendCommand("ATST64");
    } catch {
      /* ignore */
    }

    try {
      for (const target of targets) {
        if (shouldStop?.()) break;
        const allowMitsubishiKwp = target.mitsubishiKwp ?? !catalogTargets?.length;
        const txHex = target.tx.toString(16).toUpperCase();
        const rxHex = target.rx.toString(16).toUpperCase();
        const visibleTitle =
          onlyBrand === "mitsubishi" ? target.title.replace(/\s*\([^)]*\)\s*$/u, "") : target.title;
        onProgress?.(`Проверка ошибок ${visibleTitle}…`, [...out]);

        let responded = false;
        let sessionOpened = false;
        let kwpSessionOpened = false;
        let systemName: string | null = null;
        let partNumber: string | null = null;
        let diagVersion: string | null = null;
        const dtcs: ModuleDtcItem[] = [];
        let rawStatus = "Нет ответа";

        if (allowMitsubishiKwp) {
          for (const kwpSessionCmd of ["1092", "10C0"]) {
            try {
              const rawKwp10 = await this.udsExchange(target.tx, target.rx, kwpSessionCmd, 900);
              const pKwp10 = parseUdsResponse(rawKwp10, 0x10);
              if (pKwp10.kind !== "empty") {
                responded = true;
                if (pKwp10.kind === "positive") {
                  kwpSessionOpened = true;
                  break;
                }
              }
            } catch {
              /* ignore */
            }
          }
        }

        if (!kwpSessionOpened) {
          try {
            const raw10 = await this.udsExchange(target.tx, target.rx, "1003", 900);
            const p10 = parseUdsResponse(raw10, 0x10);
            if (p10.kind !== "empty") {
              responded = true;
              if (p10.kind === "positive") sessionOpened = true;
            }
          } catch {
            /* ignore */
          }
        }

        let kwpReadPositive = false;
        if (allowMitsubishiKwp && (kwpSessionOpened || target.mode03Fallback)) {
          const kwpDtcCmds = target.tx === 0x7e0 ? ["1800FF00", "1802FF00"] : ["1800FF00"];
          for (const kwpCmd of kwpDtcCmds) {
            try {
              const raw18 = await this.udsExchange(target.tx, target.rx, kwpCmd, 1_400);
              const p18 = parseUdsResponse(raw18, 0x18);
              if (p18.kind === "positive") {
                responded = true;
                kwpReadPositive = true;
                const kwpDtcs = parseKwpDtcs18(p18.payload);
                for (const d of kwpDtcs) {
                  if (!dtcs.some((existing) => existing.code === d.code)) {
                    dtcs.push({
                      code: d.code,
                      active: d.active,
                      description: d.description,
                      remedy: d.remedy,
                      statusByte: d.statusByte,
                    });
                  }
                }
                rawStatus =
                  dtcs.length === 0
                    ? "0 ошибок (KWP 18 00)"
                    : `Найдено ошибок: ${dtcs.length} (KWP 18 00)`;
                break;
              }
            } catch {
              /* ignore */
            }
          }
        }

        // Try reading UDS 19 02 FF when the module answered in UDS or when KWP 18 00 was not supported
        if (!kwpReadPositive && (responded || target.mode03Fallback || !allowMitsubishiKwp)) {
          try {
            const raw19 = await this.udsExchange(target.tx, target.rx, "1902FF", 1_400);
            const p19 = parseUdsResponse(raw19, 0x19);
            if (p19.kind === "positive") {
              responded = true;
              const parsedDtcs: ParsedUdsDtc[] = parseUdsDtcs1902(p19.payload);
              for (const d of parsedDtcs) {
                if (!dtcs.some((existing) => existing.code === d.code)) {
                  dtcs.push({
                    code: d.code,
                    active: d.active,
                    description: d.description,
                    remedy: d.remedy,
                    statusByte: d.statusByte,
                  });
                }
              }
              rawStatus =
                dtcs.length === 0
                  ? "0 ошибок (UDS 19 02)"
                  : `Найдено ошибок: ${dtcs.length} (UDS 19 02)`;
            } else if (p19.kind === "negative") {
              responded = true;
              rawStatus = `UDS 19 02: ${p19.nrcText ?? "не поддерживается"}`;
            }
          } catch {
            /* ignore */
          }
        }

        // Fallback to KWP 18 00 if UDS 19 02 returned negative and KWP was not tried yet
        if (allowMitsubishiKwp && !kwpReadPositive && responded && rawStatus.startsWith("UDS 19 02:")) {
          const kwpDtcCmds = target.tx === 0x7e0 ? ["1800FF00", "1802FF00"] : ["1800FF00"];
          for (const kwpCmd of kwpDtcCmds) {
            try {
              const raw18 = await this.udsExchange(target.tx, target.rx, kwpCmd, 1_400);
              const p18 = parseUdsResponse(raw18, 0x18);
              if (p18.kind === "positive") {
                responded = true;
                kwpReadPositive = true;
                const kwpDtcs = parseKwpDtcs18(p18.payload);
                for (const d of kwpDtcs) {
                  if (!dtcs.some((existing) => existing.code === d.code)) {
                    dtcs.push({
                      code: d.code,
                      active: d.active,
                      description: d.description,
                      remedy: d.remedy,
                      statusByte: d.statusByte,
                    });
                  }
                }
                rawStatus =
                  dtcs.length === 0
                    ? "0 ошибок (KWP 18 00)"
                    : `Найдено ошибок: ${dtcs.length} (KWP 18 00)`;
                break;
              }
            } catch {
              /* ignore */
            }
          }
        }

        // Supplement with OBD Mode 03 (stored) and Mode 07 (pending) on ECM/TCM (7E0/7E1)
        const isObdPowertrain = Boolean(target.mode03Fallback) || target.tx === 0x7e0 || target.tx === 0x7e1;
        if (isObdPowertrain || (responded && rawStatus.startsWith("UDS 19 02:"))) {
          try {
            const raw03 = await this.udsExchange(target.tx, target.rx, "03", 1_400);
            const p03 = parseUdsResponse(raw03, 0x03);
            if (p03.kind === "positive") {
              responded = true;
              const obdList = parseDtcsFromElmResponse(raw03);
              for (const d of obdList) {
                if (!dtcs.some((existing) => existing.code === d.code)) {
                  dtcs.push({
                    code: d.code,
                    active: true,
                    description: d.description,
                    remedy: remedyForDtcCode(d.code),
                  });
                }
              }
              if (!kwpReadPositive || dtcs.length > 0) {
                rawStatus =
                  dtcs.length === 0
                    ? "0 ошибок (Mode 03)"
                    : `Найдено ошибок: ${dtcs.length}`;
              }
            }
          } catch {
            /* ignore */
          }
          if (isObdPowertrain) {
            try {
              const raw07 = await this.udsExchange(target.tx, target.rx, "07", 1_200);
              const p07 = parseUdsResponse(raw07, 0x07);
              if (p07.kind === "positive") {
                responded = true;
                const pendingList = parseDtcsFromElmResponse(raw07);
                for (const d of pendingList) {
                  if (!dtcs.some((existing) => existing.code === d.code)) {
                    dtcs.push({
                      code: d.code,
                      active: false,
                      description: d.description,
                      remedy: remedyForDtcCode(d.code),
                    });
                  }
                }
                if (dtcs.length > 0) {
                  rawStatus = `Найдено ошибок: ${dtcs.length}`;
                }
              }
            } catch {
              /* ignore */
            }
          }
        }

        // If responded, quickly read F197 / F18E if available
        if (responded) {
          try {
            const raw97 = await this.udsExchange(target.tx, target.rx, "22F197", 800);
            const p97 = parseUdsResponse(raw97, 0x22);
            if (p97.kind === "positive" && p97.payload.length > 2) {
              const txt = p97.payload
                .slice(2)
                .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                .join("")
                .replace(/\s+/g, " ")
                .trim();
              if (txt.length >= 3) systemName = txt;
            }
          } catch {
            /* ignore */
          }
          try {
            const raw8e = await this.udsExchange(target.tx, target.rx, "22F18E", 800);
            const p8e = parseUdsResponse(raw8e, 0x22);
            if (p8e.kind === "positive" && p8e.payload.length > 2) {
              const txt = p8e.payload
                .slice(2)
                .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                .join("")
                .replace(/\s+/g, " ")
                .trim();
              if (txt.length >= 4 && !/^0+$/.test(txt)) partNumber = txt;
            }
          } catch {
            /* ignore */
          }
          if ((!partNumber || !diagVersion) && allowMitsubishiKwp) {
            try {
              const raw87 = await this.udsExchange(target.tx, target.rx, "1A87", 800);
              const p87 = parseUdsResponse(raw87, 0x1a);
              if (p87.kind === "positive" && p87.payload.length > 2) {
                const identity = parseMitsubishiModuleIdentity("1A87", p87.payload);
                if (identity.partNumber) partNumber = partNumber ?? identity.partNumber;
                if (identity.diagVersion) diagVersion = diagVersion ?? identity.diagVersion;
                if (!partNumber) {
                  const txt = p87.payload
                    .slice(1)
                    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                    .join("")
                    .replace(/\s+/g, " ")
                    .trim();
                  if (txt.length >= 4) partNumber = txt;
                }
              }
            } catch {
              /* ignore */
            }
          }
          if (sessionOpened) {
            try {
              await this.udsExchange(target.tx, target.rx, "1001", 700);
            } catch {
              /* ignore */
            }
          }
          if (kwpSessionOpened) {
            try {
              await this.udsExchange(target.tx, target.rx, "1081", 700);
            } catch {
              /* ignore */
            }
          }
        }

        out.push({
          txHex,
          rxHex,
          title: visibleTitle,
          safetyCritical: target.safetyCritical,
          canSafeClear: target.canSafeClear,
          responded,
          systemName,
          partNumber,
          diagVersion,
          dtcs,
          rawStatus,
        });
        onProgress?.(`Проверен ${target.title}`, [...out]);
      }
    } finally {
      try {
        await this.elm!.sendCommand("ATSTFF");
      } catch {
        /* ignore */
      }
    }

    return out;
  }

  /**
   * Safely clears DTCs on modules (ECM, TCM, SRS, ABS/ASC, Meter, BIU/ETACS, Climate, Sonar).
   * Explicitly refuses EPS (746/796), SAS (622), EPB (610), and EyeSight (787) to protect steering/brake-pad/camera calibrations.
   */
  async clearModuleDtcsSafe(
    protocol: CanProtocol,
    txHex: string,
    rxHex: string,
  ): Promise<string> {
    const cleanTx = txHex.trim().toUpperCase();
    const cleanRx = rxHex.trim().toUpperCase();
    const FORBIDDEN_CLEAR_TX = new Set(["746", "787", "622", "796", "7E2", "7E5", "610"]);
    if (FORBIDDEN_CLEAR_TX.has(cleanTx)) {
      throw new Error(
        `Сброс ошибок в блоке (${cleanTx}) заблокирован для защиты калибровок SAS / EPS / EPB / EyeSight. Доступно только чтение.`,
      );
    }
    this.requireAdapter();
    await this.waitLeave();
    if (this.elm!.isMonitoring) throw new Error("Остановите CAN-монитор перед сбросом ошибок");
    await this.ensureUdsProfile(protocol);

    const txNum = Number.parseInt(cleanTx, 16);
    const rxNum = cleanRx ? Number.parseInt(cleanRx, 16) : undefined;
    let mode04Cleared = false;

    if (cleanTx === "7E0" || cleanTx === "7E1") {
      try {
        const raw04 = await this.udsExchange(txNum, rxNum, "04", 3_000);
        const p04 = parseUdsResponse(raw04, 0x04);
        if (p04.kind === "positive") mode04Cleared = true;
      } catch {
        /* try KWP / UDS clear below */
      }
    }

    try {
      await this.udsExchange(txNum, rxNum, "1003", 1_000);
    } catch {
      /* ignore */
    }
    try {
      const raw14 = await this.udsExchange(txNum, rxNum, "14FFFFFF", 3_000);
      const p14 = parseUdsResponse(raw14, 0x14);
      if (p14.kind === "positive") {
        return `Коды ошибок блока ${cleanTx} сброшены (UDS 14 FF FF FF OK)`;
      }
      // Fallback to KWP2000 10 92 + 14 FF 00 for Mitsubishi modules (including SRS 6E0, ABS/ASC 784, ECM 7E0, TCM 7E1, ETACS 620)
      await this.udsExchange(txNum, rxNum, "1092", 1_000);
      const rawKwp14 = await this.udsExchange(txNum, rxNum, "14FF00", 3_000);
      const pKwp14 = parseUdsResponse(rawKwp14, 0x14);
      if (pKwp14.kind === "positive") {
        return `Коды ошибок блока ${cleanTx} сброшены (KWP 14 FF 00 OK)`;
      }
      if (mode04Cleared) {
        return `Коды ошибок блока ${cleanTx} сброшены (Mode 04 OK)`;
      }
      if (p14.kind === "negative") {
        throw new Error(`Отказ блока ${cleanTx} при сбросе (7F 14): ${p14.nrcText ?? ""}`);
      }
      throw new Error(`Блок ${cleanTx} не подтвердил сброс ошибок.`);
    } finally {
      try {
        await this.udsExchange(txNum, rxNum, "1001", 800);
      } catch {
        /* ignore */
      }
      try {
        await this.udsExchange(txNum, rxNum, "1081", 800);
      } catch {
        /* ignore */
      }
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

  async linkVehicle(): Promise<VehicleLinkState> {
    await this.leaveSpecialMode();
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

  async readLivePids(onlyPids?: ReadonlySet<string>): Promise<LivePidReading[]> {
    await this.leaveSpecialMode();
    this.requireVehicle();
    const supported = LIVE_PIDS.filter((def) => this.pidIsSupported(def));
    const wantsBoost = !onlyPids || onlyPids.size === 0 || onlyPids.has("01BOOST");
    const filtered =
      onlyPids && onlyPids.size > 0
        ? supported.filter(
            (def) =>
              onlyPids.has(def.pid) ||
              (wantsBoost && (def.pid === "010B" || def.pid === "0187" || def.pid === "0170" || def.pid === "0133")),
          )
        : supported;
    const visible = filtered.length > 0 ? filtered : supported;
    const refreshSlow = (onlyPids && onlyPids.size > 0) || this.sweep % 4 === 0;
    this.sweep += 1;
    const todo = visible.filter((def) => def.pace === "fast" || refreshSlow);

    // If neither 010B nor 0187 is in the supported bitmap (e.g. FA24F hides 010B in 0100), probe 0187 and 010B directly
    const hasMapTodo = todo.some((d) => d.pid === "010B" || d.pid === "0187");
    if (wantsBoost && !hasMapTodo) {
      const def87 = LIVE_PIDS.find((d) => d.pid === "0187");
      const def0B = LIVE_PIDS.find((d) => d.pid === "010B");
      if (def87) todo.push(def87);
      if (def0B) todo.push(def0B);
    }

    await this.fillReadings(todo);

    const out = visible
      .filter((def) => !onlyPids || onlyPids.size === 0 || onlyPids.has(def.pid))
      .map((def) => this.readingCache.get(def.pid) ?? { def, value: null, raw: "" });

    // Compute live Turbo Boost / Vacuum in bar from 0187 (wide-range MAP), 010B (standard MAP), or 0170 (boost control)
    const mapReading =
      (this.readingCache.get("0187")?.value != null ? this.readingCache.get("0187") : null) ??
      (this.readingCache.get("010B")?.value != null ? this.readingCache.get("010B") : null) ??
      (this.readingCache.get("0170")?.value != null ? this.readingCache.get("0170") : null);
    if (wantsBoost) {
      const baro = this.readingCache.get("0133")?.value ?? 101;
      const boostBar =
        mapReading && mapReading.value != null ? (mapReading.value - baro) / 100 : null;
      const boostEntry: LivePidReading = {
        def: BOOST_DERIVED_PID,
        value: boostBar,
        raw: mapReading?.raw ?? "",
      };
      const mapIdx = out.findIndex((item) => item.def.pid === "0187" || item.def.pid === "010B");
      if (mapIdx >= 0) {
        out.splice(mapIdx + 1, 0, boostEntry);
      } else {
        out.unshift(boostEntry);
      }
    }

    return out;
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

  private async udsExchange(
    tx: number,
    rx: number | undefined,
    request: string,
    timeoutMs = 5_000,
  ): Promise<string> {
    const send = async () => {
      if (rx == null && tx >= 0x7e0 && tx <= 0x7e7) {
        await this.elm!.setCanHeader(tx, undefined);
        await this.elm!.clearRxFilter();
      } else {
        const effectiveRx = rx ?? ((tx + 8) & 0x7ff);
        await this.elm!.setCanHeader(tx, effectiveRx);
      }
      return this.elm!.sendPayload(request, timeoutMs);
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
    for (const next of [0x20, 0x40, 0x60, 0x80, 0xa0]) {
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
