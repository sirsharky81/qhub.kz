import type { BleLink } from "./ble-link";
import { formatBleFailure } from "./ble-error";
import type { CanProtocol } from "./can-frame";
import { normalizeCanToken } from "./can-frame";
import { requestBleLink, getObdTransportKind, type ObdTransportKind } from "./create-ble-link";
import { Elm327Client, type ElmIdentity } from "./elm327";
import {
  ETACS_PROFILES,
  readEtacsCoding,
  type EtacsCodingDump,
} from "./mitsubishi-etacs";
import {
  DID_LABELS,
  DID_SCAN_FROM,
  DID_SCAN_SILENCE,
  DID_SCAN_TO,
  KNOWN_MODULE_TARGETS,
  MODULE_SCAN_ADDRESSES,
  assessUdsRequest,
  describeCanModule,
  formatUdsPayload,
  parseTaggedUdsReplies,
  parseUdsResponse,
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

const FREEZE_PIDS = ["010C", "010D", "0104", "0105", "0111", "0106"];

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
    return readEtacsCoding(this.elm!, profile);
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
          // Many Subaru / Mitsubishi ECUs (especially TCM 7E1) stay silent on 3E 00 until 10 03 or 22 F18E / 09 04 is sent.
          if (tagged.length === 0 && !wide && address !== 0x7df) {
            raw = await this.udsExchange(address, target.rx, "1003", 1_500);
            tagged = parseTaggedUdsReplies(raw, 0x10);
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
                const pRaw = await this.udsExchange(address, target.rx, "22F18E", 1_100);
                const pParsed = parseUdsResponse(pRaw, 0x22);
                if (pParsed.kind === "positive" && pParsed.payload.length > 2) {
                  const ascii = pParsed.payload
                    .slice(2)
                    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
                    .join("")
                    .trim();
                  if (ascii.length >= 4) partNumber = ascii;
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
      for (let did = fromDid; did <= toDid; did++) {
        if (shouldStop()) return;
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
            const label = DID_LABELS[didHex];
            const formatted = formatUdsPayload(body, 0x22);
            hit = { did: label ? `${didHex} · ${label}` : didHex, text: formatted };
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
      { tx: 0x783, rx: 0x78b, title: "Приборка SGP (METER 783 → 78B)" },
      { tx: 0x787, rx: 0x78f, title: "Камера EyeSight SGP (787 → 78F)" },
      { tx: 0x740, rx: 0x748, title: "Боди-модуль BIU (740 → 748)" },
      { tx: 0x7c4, rx: 0x7cc, title: "Климат-контроль A/C (7C4 → 7CC)" },
      { tx: 0x7c0, rx: 0x7c8, title: "Приборка / MFD (7C0 → 7C8)" },
      { tx: 0x786, rx: 0x78e, title: "Сонары / Парктроник RAB (786 → 78E)" },
    ];

    const configDids = [
      0xf182, 0xf186, 0xf187, 0xf188, 0xf189, 0xf18a, 0xf18b, 0xf18c, 0xf18e, 0xf190, 0xf191,
      0xf192, 0xf193, 0xf194, 0xf195, 0xf197, 0xf198, 0xf199, 0xf19e,
      0x1000, 0x1001, 0x1002, 0x1003, 0x1004, 0x1005, 0x1006, 0x1007, 0x1008, 0x1009, 0x100a,
      0x1010, 0x1011, 0x1012, 0x1020, 0x1021,
      0x1100, 0x1101, 0x1102, 0x1103, 0x1104, 0x1105,
      0x2100, 0x2101, 0x2102, 0x2103, 0x2104,
      0xd001, 0xd002, 0xd003, 0xd004,
    ];

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

        const dids: { did: string; label: string; hex: string; decoded: string }[] = [];
        let systemName: string | null = null;
        let partNumber: string | null = null;
        let softwareVersion: string | null = null;
        let calId: string | null = null;

        if (responded) {
          let step = 0;
          for (const didNum of configDids) {
            if (shouldStop?.()) break;
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
                const decoded = formatUdsPayload(parsed.payload, 0x22);
                const ascii = body
                  .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
                  .join("")
                  .replace(/\s+/g, " ")
                  .trim();
                const label = DID_LABELS[didHex] ?? `DID ${didHex}`;
                dids.push({ did: didHex, label, hex, decoded });
                if (didHex === "F197" && ascii) systemName = ascii;
                if ((didHex === "F18E" || didHex === "F187") && ascii) partNumber = ascii;
                if ((didHex === "F189" || didHex === "F195") && ascii) softwareVersion = ascii;
                if (didHex === "F182") calId = ascii || hex;
                if (didHex === "F190" && ascii.length >= 11) vin = ascii;
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
      const standardRx = rx == null || rx === ((tx + 8) & 0x7ff);
      if (standardRx) await this.elm!.clearRxFilter();
      await this.elm!.setCanHeader(tx, standardRx ? undefined : rx);
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
