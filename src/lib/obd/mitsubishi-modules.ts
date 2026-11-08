import type { Elm327Client } from "./elm327";
import { extractHexTokens, stripElmMultiline } from "./hex";
import { parseMitsubishiModuleIdentity } from "./mitsubishi-mut-monitor";
import {
  assertMitsubishiProcedureForEcu,
  decodeMitsubishiDieselInjectorIds21BF,
  decodeMitsubishiServiceReminder21BC,
  type MitsubishiServiceExecutionResult,
} from "./mitsubishi-service-procedures";
import { decodeSubaruTpmsBytes } from "./subaru-decode";
import { parseKwpDtcs18, parseUdsResponse } from "./uds";

export interface MitsubishiTcmTelemetry {
  transmissionType: "8AT" | "5AT" | "CVT";
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  swVersion: string | null;
  /** Primary ATF / CVT fluid temperature in °C (MUT-III: 8AT A−50, CVT A−55). */
  atfTempC: number | null;
  /** 8AT pipe sensor (MUT-III `A/T fluid temp.sensor (Pipe)`, 21 02 byte F, A−50). */
  atfTempPipeC: number | null;
  /** 8AT oil-pan sensor (MUT-III `A/T fluid temp.sensor (Oil pan)`, 21 02 byte G, A−50). */
  atfTempPanC: number | null;
  /** Scale taken from MUT-III SE Data List. */
  atfFormula: "a-50" | "a-55";
  /** Selector lever position (`P`, `R`, `N`, `D`, `2`, `L`, `Ds/M`). */
  selectorPosition: string;
  /** Currently engaged gear (`P/N`, `R`, `1`..`8`, or `—`). */
  currentGearText: string;
  /** Numeric forward gear (`1`..`8`) or `0` when in P/N, `-1` when in R. */
  gearNumber: number | null;
  /** True when the transmission is in Neutral/Park or clutch is disengaged (`{J:0}=1` or selector in P/N). */
  isGearDisengaged: boolean;
  /** Human-readable explanation of disengaged / neutral / lock-up state. */
  disengagedStateText: string;
  /** Input shaft / primary pulley speed in RPM (`B*128 + C*0.5`). */
  inputShaftRpm: number | null;
  /** Output shaft / secondary pulley speed in RPM (`D*128 + E*0.5`). */
  outputShaftRpm: number | null;
  /** Torque converter damper slip in RPM (`I - 51`). */
  torqueConverterSlipRpm: number | null;
  /** TCM supply voltage in V (`G * 33.15 / 255`). */
  controlVoltageV: number | null;
  /** Vehicle speed reported by TCM in km/h (`H * 714 / 255`). */
  vehicleSpeedKmh: number | null;
  /** CVT fluid degradation counter (`21 10`: `AB*65536 + AC*256 + AD`). */
  cvtDegradationCount: number | null;
  /** Raw hex strings for diagnostic transparency. */
  raw2102: string | null;
  raw2104: string | null;
  raw2103: string | null;
}

export interface TpmsWheelReading {
  wheelIndex: 1 | 2 | 3 | 4 | 5;
  defaultLabel: string;
  sensorIdHex: string | null;
  pressureBar: number | null;
  pressureKpa: number | null;
  pressurePsi: number | null;
  temperatureC: number | null;
  /** Discrete transmitter battery state from MUT-III TPMS (`C1910..C1950` / `C1915..C1955` + ID reception). */
  batteryStatus?: "ok" | "low" | "off" | "unknown";
  batteryText?: string | null;
  statusText: string;
}

export interface TpmsModuleReport {
  brand: "mitsubishi" | "subaru";
  moduleName: string;
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  activeSet: 1 | 2 | null;
  wheels: TpmsWheelReading[];
  rawHex: string;
}

export interface MitsubishiSteeringReport {
  source: "sas-622" | "abs-784" | "eps-746";
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  angleDeg: number;
  angularSpeedDegPerSec: number | null;
  calibrated: boolean | null;
  wheelSpeedsKmh?: { fl: number; fr: number; rl: number; rr: number } | null;
  brakePressureBar?: number | null;
  lateralG?: number | null;
  rawHex: string;
}

export interface SasCalibrationResult {
  success: boolean;
  steps: string[];
  finalAngleDeg: number | null;
}

export interface MitsubishiMeterReport {
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  vin: string | null;
  fuelLiters: number | null;
  /** Fuel gauge target in % (MUT-III `21 A3` / `21 C3` bytePos 4, `raw - 16`, `0..100%`). */
  fuelPercent?: number | null;
  /** Fuel gauge sensor resistance in Ohm (MUT-III `21 A3` / `21 C3` bytePos 2..3, little-endian, `×0.1 Ω`). */
  fuelSensorOhm?: number | null;
  fuelRawByte: number | null;
  odometerKm: number | null;
  rawFuelHex: string | null;
  rawOdoHex: string | null;
}

/**
 * Extract payload bytes after positive KWP response `61 <LID>` (strips ISO-TP length and trailing padding).
 */
export function extractKwp21Data(raw: string, lid: number): number[] | null {
  const { declaredLength } = stripElmMultiline(raw);
  const tokens = extractHexTokens(raw);
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i] === 0x61 && tokens[i + 1] === lid) {
      let data = tokens.slice(i + 2);
      if (declaredLength != null && declaredLength > 2) {
        const expected = declaredLength - 2;
        if (expected > 0 && expected <= data.length) {
          data = data.slice(0, expected);
        }
      }
      return data;
    }
  }
  return null;
}

/**
 * Decode Mitsubishi AT (`V8AWG` 8AT on Pajero Sport III 6B31/4N15, `V5A5A` 5AT) `21 02` and `21 04` responses.
 *
 * Byte convention in Torque / HobDrive / MUT-III for `61 02 A B C D E F G H I J [K]`:
 * - `data[0]` = A (status/header byte)
 * - `data[1]` = B, `data[2]` = C -> Input Shaft RPM = `B * 128 + C * 0.5`
 * - `data[3]` = D, `data[4]` = E -> Output Shaft RPM = `D * 128 + E * 0.5`
 * - `data[5]` = F -> ATF pipe °C = `F − 50` (MUT-III AT8 `A/T fluid temp.sensor (Pipe)`)
 * - `data[6]` = G -> ATF pan °C = `G − 50` on 8AT; TCM voltage on 5AT (`G * 33.15 / 255`)
 * - `data[7]` = H -> Vehicle Speed (km/h) = `H * 2.8` (= `H * 714 / 255`)
 * - `data[8]` = I -> Torque Converter Damper Slip (RPM) = `I - 51`
 * - `data[9]` = J -> Gear bitmask:
 *   - bit 0 (`0x01`): P / N (Передача выключена)
 *   - bit 1 (`0x02`): R (Задний ход)
 *   - bit 2 (`0x04`): 1-я передача
 *   - bit 3 (`0x08`): 2-я передача
 *   - bit 4 (`0x10`): 3-я передача
 *   - bit 5 (`0x20`): 4-я передача
 *   - bit 6 (`0x40`): 5-я передача
 *   - bit 7 (`0x80`): 6-я передача
 * - `data[10]` = K (on 8AT V8AWG):
 *   - bit 0 (`0x01`): 7-я передача
 *   - bit 1 (`0x02`): 8-я передача
 */
export function decodeMitsubishiAt2102And2104(
  data2102: number[],
  data2104?: number[] | null,
): Omit<
  MitsubishiTcmTelemetry,
  "txHex" | "rxHex" | "partNumber" | "swVersion" | "cvtDegradationCount" | "raw2102" | "raw2104" | "raw2103"
> {
  const B = data2102[1];
  const C = data2102[2];
  const D = data2102[3];
  const E = data2102[4];
  const F = data2102[5];
  const G = data2102[6];
  const H = data2102[7];
  const I = data2102[8];
  const J = data2102[9];
  const K = data2102[10];

  const inputShaftRpm = B != null && C != null ? Math.round(B * 128 + C * 0.5) : null;
  const outputShaftRpm = D != null && E != null ? Math.round(D * 128 + E * 0.5) : null;
  const is8at = data2102.length >= 11;
  const atfTempPipeC = F != null ? F - 50 : null;
  const atfTempPanC = is8at && G != null ? G - 50 : null;
  const atfTempC = atfTempPanC ?? atfTempPipeC;
  const controlVoltageV =
    !is8at && G != null ? Number(((G * 33.15) / 255).toFixed(2)) : null;
  const vehicleSpeedKmh = H != null ? Math.round((H * 714) / 255) : null;
  const torqueConverterSlipRpm = I != null ? I - 51 : null;

  // Decode selector lever from 21 04 byte C (`data2104[2]`) if available
  let selectorPosition = "—";
  let selectorIsNeutralOrPark = false;
  if (data2104 && data2104.length >= 3) {
    const selByte = data2104[2]!;
    if ((selByte & 0x01) !== 0) {
      selectorPosition = "P (Паркинг)";
      selectorIsNeutralOrPark = true;
    } else if ((selByte & 0x02) !== 0) {
      selectorPosition = "R (Задний ход)";
    } else if ((selByte & 0x04) !== 0) {
      selectorPosition = "N (Нейтраль)";
      selectorIsNeutralOrPark = true;
    } else if ((selByte & 0x08) !== 0) {
      selectorPosition = "D (Движение)";
    } else if ((selByte & 0x40) !== 0) {
      selectorPosition = "2 / Ручной ряд";
    } else if ((selByte & 0x80) !== 0) {
      selectorPosition = "L / Пониженный ряд";
    }
  }

  let gearNumber: number | null = null;
  let currentGearText = "—";
  let jBitPN = false;

  if (J != null) {
    jBitPN = (J & 0x01) !== 0;
    const isRev = (J & 0x02) !== 0;
    const g1to6 =
      ((J >> 2) & 1) * 1 +
      ((J >> 3) & 1) * 2 +
      ((J >> 4) & 1) * 3 +
      ((J >> 5) & 1) * 4 +
      ((J >> 6) & 1) * 5 +
      ((J >> 7) & 1) * 6;
    const g7to8 = K != null ? (K & 1) * 7 + ((K >> 1) & 1) * 8 : 0;
    const forwardGear = g7to8 > 0 ? g7to8 : g1to6;

    if (jBitPN) {
      gearNumber = 0;
      currentGearText = selectorPosition.startsWith("P")
        ? "P (Передача выключена)"
        : selectorPosition.startsWith("N")
          ? "N (Передача выключена)"
          : "P / N (Передача выключена)";
      if (selectorPosition === "—") selectorPosition = "P / N";
    } else if (isRev) {
      gearNumber = -1;
      currentGearText = "R (Задний ход)";
      if (selectorPosition === "—") selectorPosition = "R";
    } else if (forwardGear >= 1 && forwardGear <= 8) {
      gearNumber = forwardGear;
      currentGearText = `${forwardGear}-я передача`;
      if (selectorPosition === "—") selectorPosition = `D (${forwardGear})`;
    } else if (J === 0 && (K == null || K === 0)) {
      gearNumber = 0;
      currentGearText = "Выключена (0)";
    }
  }

  const isAutoNeutralInD =
    !jBitPN &&
    !selectorIsNeutralOrPark &&
    (vehicleSpeedKmh ?? 0) === 0 &&
    (outputShaftRpm ?? 0) === 0 &&
    (inputShaftRpm ?? 0) > 450 &&
    (torqueConverterSlipRpm ?? 0) > 150;

  const isGearDisengaged = jBitPN || selectorIsNeutralOrPark || gearNumber === 0;

  let disengagedStateText: string;
  if (jBitPN || selectorIsNeutralOrPark || gearNumber === 0) {
    disengagedStateText = "ПЕРЕДАЧА ВЫКЛЮЧЕНА (P / N — трансмиссия разомкнута)";
  } else if (isAutoNeutralInD) {
    disengagedStateText = `Удержание на тормозе (${currentGearText}, ГДТ разомкнут, скольжение ${torqueConverterSlipRpm ?? 0} об/мин)`;
  } else if (gearNumber != null && gearNumber > 0) {
    const lockState =
      torqueConverterSlipRpm != null && Math.abs(torqueConverterSlipRpm) <= 15
        ? "ГДТ заблокирован"
        : `скольжение ГДТ ${torqueConverterSlipRpm ?? 0} об/мин`;
    disengagedStateText = `Передача включена (${currentGearText}, ${lockState})`;
  } else if (gearNumber === -1) {
    disengagedStateText = "Включен задний ход (R)";
  } else {
    disengagedStateText = "Ожидание данных селектора";
  }

  return {
    transmissionType: is8at ? "8AT" : "5AT",
    atfTempC,
    atfTempPipeC,
    atfTempPanC,
    atfFormula: "a-50",
    selectorPosition,
    currentGearText,
    gearNumber,
    isGearDisengaged,
    disengagedStateText,
    inputShaftRpm,
    outputShaftRpm,
    torqueConverterSlipRpm,
    controlVoltageV,
    vehicleSpeedKmh,
  };
}

/**
 * Decode Mitsubishi CVT (`7E1 -> 7E9`, Jatco JF011E / JF015E / JF016E / JF017E on Outlander / ASX / Lancer X / Eclipse Cross)
 * verified against `CVT_14080300.exdf`, `CVT_14880100.exdf`, `CVT_14880110.exdf`:
 * - `21 03`:
 *   - `bytePos = 2` (`data2103[0]`, 1B, `×32`): `Primary speed (Control)` (Input shaft RPM)
 *   - `bytePos = 3` (`data2103[1]`, 1B, `×64`): `Secondary speed (Control)` (Output shaft RPM)
 *   - `bytePos = 4` (`data2103[2]`, 1B, `×32`): `Engine revolution` (RPM)
 *   - `bytePos = 5` (`data2103[3]`, 1B signed 2's complement): `Slip revolution` (RPM)
 *   - `CVT oil temperature` (`A − 55 °C`): `bytePos = 15` (`data2103[13]`) on 17-byte `CVT_14080300`, `bytePos = 14` (`data2103[12]`) on 15-byte `CVT_14880100`
 *   - `Real vehicle speed` (`km/h`): `bytePos = 17` (`data2103[15]`) on 17-byte `CVT_14080300`, `bytePos = 16` (`data2103[14]`) on 15-byte `CVT_14880100`
 * - `21 06`: `bytePos = 2` (`data2106[0]`) shift indicator bits (`P/R/N/D/Ds/L`), `bytePos = 4` (`data2106[2]`) manual gear (`0..7` = `1st..8th`, `0xFF` = `D`)
 * - `21 07`: `bytePos = 2` (`data2107[0]`) selector switch bits (`0x10=P, 0x20=R, 0x40=N, 0x80=D`)
 * - `21 0E` (`bytePos = 28..31`, `data210E[26..29]`) / `21 0D` (`bytePos = 2..5`, `data210D[0..3]`): 32-bit `CVT oil degradation level`
 */
export function decodeMitsubishiCvt(options: {
  data2103?: number[] | null;
  data2106?: number[] | null;
  data2107?: number[] | null;
  data210E?: number[] | null;
  data210D?: number[] | null;
  data2110?: number[] | null;
}): Omit<
  MitsubishiTcmTelemetry,
  "txHex" | "rxHex" | "partNumber" | "swVersion" | "raw2102" | "raw2104" | "raw2103"
> {
  const { data2103, data2106, data2107, data210E, data210D, data2110 } = options;
  let atfTempC: number | null = null;
  let inputShaftRpm: number | null = null;
  let outputShaftRpm: number | null = null;
  let torqueConverterSlipRpm: number | null = null;
  let vehicleSpeedKmh: number | null = null;

  if (data2103 && data2103.length >= 4) {
    inputShaftRpm = data2103[0]! * 32;
    outputShaftRpm = data2103[1]! * 64;
    const rawSlip = data2103[3]!;
    torqueConverterSlipRpm = rawSlip >= 0x80 ? rawSlip - 0x100 : rawSlip;

    if (data2103.length === 15) {
      // CVT_14880100 / CVT_14880110 (JF011E / JF015E, 15 data bytes): bytePos 14 = data2103[12], speed bytePos 16 = data2103[14]
      atfTempC = data2103[12]! - 55;
      vehicleSpeedKmh = data2103[14]!;
    } else if (data2103.length >= 14) {
      // CVT_14080300 (JF016E / JF017E, 17 data bytes): bytePos 15 = data2103[13], speed bytePos 17 = data2103[15]
      atfTempC = data2103[13]! - 55;
      if (data2103.length >= 17) {
        vehicleSpeedKmh = data2103[15]!;
      }
    }
  }

  let selectorPosition = "—";
  let isGearDisengaged = false;
  if (data2107 && data2107.length >= 1) {
    const a = data2107[0]!;
    if ((a & 0x10) !== 0) {
      selectorPosition = "P (Паркинг)";
      isGearDisengaged = true;
    } else if ((a & 0x20) !== 0) {
      selectorPosition = "R (Задний ход)";
    } else if ((a & 0x40) !== 0) {
      selectorPosition = "N (Нейтраль)";
      isGearDisengaged = true;
    } else if ((a & 0x80) !== 0) {
      selectorPosition = "D (Движение)";
    }
  } else if (data2106 && data2106.length >= 1) {
    const ind = data2106[0]!;
    if ((ind & 0x01) !== 0) {
      selectorPosition = "P (Паркинг)";
      isGearDisengaged = true;
    } else if ((ind & 0x02) !== 0) {
      selectorPosition = "R (Задний ход)";
    } else if ((ind & 0x04) !== 0) {
      selectorPosition = "N (Нейтраль)";
      isGearDisengaged = true;
    } else if ((ind & 0x08) !== 0) {
      selectorPosition = "D (Движение)";
    } else if ((ind & 0x10) !== 0) {
      selectorPosition = "Ds (Спорт)";
    } else if ((ind & 0x20) !== 0) {
      selectorPosition = "L (Пониженный)";
    }
  }

  let gearNumber: number | null = null;
  let currentGearText = "Вариатор (CVT)";
  if (data2106 && data2106.length >= 3) {
    const manualRaw = data2106[2]!;
    if (isGearDisengaged) {
      gearNumber = 0;
      currentGearText = `${selectorPosition} — Передача выключена`;
    } else if (manualRaw <= 7) {
      gearNumber = manualRaw + 1;
      currentGearText = `Виртуальная ступень ${gearNumber}`;
    } else {
      gearNumber = null;
      currentGearText = selectorPosition.startsWith("R") ? "R (Задний ход)" : "D (Вариатор CVT)";
    }
  } else if (isGearDisengaged) {
    gearNumber = 0;
    currentGearText = `${selectorPosition} — Передача выключена`;
  }

  let cvtDegradationCount: number | null = null;
  if (data210E && data210E.length >= 30) {
    cvtDegradationCount =
      ((data210E[26]! << 24) >>> 0) +
      (data210E[27]! << 16) +
      (data210E[28]! << 8) +
      data210E[29]!;
  } else if (data210D && data210D.length >= 4) {
    cvtDegradationCount =
      ((data210D[0]! << 24) >>> 0) +
      (data210D[1]! << 16) +
      (data210D[2]! << 8) +
      data210D[3]!;
  } else if (data2110 && data2110.length >= 4) {
    const b0 = data2110[data2110.length - 3]!;
    const b1 = data2110[data2110.length - 2]!;
    const b2 = data2110[data2110.length - 1]!;
    cvtDegradationCount = b0 * 65536 + b1 * 256 + b2;
  }

  const disengagedStateText = isGearDisengaged
    ? "ПЕРЕДАЧА ВЫКЛЮЧЕНА (P / N — вариатор разомкнут)"
    : `Вариатор в рабочем режиме (${currentGearText})`;

  return {
    transmissionType: "CVT",
    atfTempC,
    atfTempPipeC: null,
    atfTempPanC: null,
    atfFormula: "a-55",
    selectorPosition,
    currentGearText,
    gearNumber,
    isGearDisengaged,
    disengagedStateText,
    inputShaftRpm,
    outputShaftRpm,
    torqueConverterSlipRpm,
    controlVoltageV: null,
    vehicleSpeedKmh,
    cvtDegradationCount,
  };
}

/**
 * Configure ELM327 for a Mitsubishi KWP2000-over-CAN module (`7E1->7E9`, `773->774`, `600->500`, `622->484`, `784->785`, `6A0->514`)
 * using explicit Flow Control (`ATFCSH`, `ATFCSD30080A`, `ATFCSM1`) and session `10 92`.
 */
export async function openMitsubishiKwpSession(
  elm: Elm327Client,
  txId: number,
  rxId: number,
  sessionHex = "1092",
): Promise<boolean> {
  const txHex = txId.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }
  await elm.setCanHeader(txId, rxId);
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* fallback for simple adapters */
  }
  try {
    const raw = await elm.sendPayload(sessionHex, 2_000);
    const tokens = extractHexTokens(raw);
    if (tokens.includes(0x50)) return true;
  } catch {
    /* try fallback 10 89 / 10 03 */
  }
  try {
    const raw89 = await elm.sendPayload("1089", 1_500);
    if (extractHexTokens(raw89).includes(0x50)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function closeMitsubishiKwpSession(elm: Elm327Client): Promise<void> {
  try {
    await elm.sendPayload("1081", 1_000);
  } catch {
    /* ignore */
  }
  try {
    await elm.sendCommand("ATFCSM0");
  } catch {
    /* ignore */
  }
}

/**
 * Read KWP `1A 87` (Hardware Part Number & DiagVersion), `1A 9C` (Software Part Number), and `1A 90` (VIN)
 * according to `MutComm.dll` (`GetECUHardwareInfo` `[0x060012CE]` & `GetECUSoftwareInfo` `[0x060012CF]`).
 */
export async function readMitsubishiKwpPassport(
  elm: Elm327Client,
): Promise<{
  partNumber: string | null;
  swVersion: string | null;
  vin: string | null;
  diagVersion?: string | null;
  supplierId?: number | null;
}> {
  let partNumber: string | null = null;
  let swVersion: string | null = null;
  let vin: string | null = null;
  let diagVersion: string | null = null;
  let supplierId: number | null = null;

  try {
    const raw87 = await elm.sendPayload("1A87", 2_000);
    const bytes = extractHexTokens(raw87);
    const idx = bytes.findIndex((b, i) => b === 0x5a && bytes[i + 1] === 0x87);
    if (idx >= 0) {
      const parsed = parseMitsubishiModuleIdentity("1A87", bytes.slice(idx + 1));
      partNumber = parsed.partNumber;
      diagVersion = parsed.diagVersion;
      supplierId = parsed.supplierId ?? null;
    }
  } catch {
    /* ignore */
  }

  try {
    const raw9c = await elm.sendPayload("1A9C", 1_800);
    const bytes = extractHexTokens(raw9c);
    const idx = bytes.findIndex((b, i) => b === 0x5a && bytes[i + 1] === 0x9c);
    if (idx >= 0) {
      const parsed9c = parseMitsubishiModuleIdentity("1A9C", bytes.slice(idx + 1));
      diagVersion = diagVersion ?? parsed9c.diagVersion;
      if (parsed9c.softwarePartNumber) {
        swVersion = parsed9c.softwarePartNumber;
      } else {
        const ascii = bytes
          .slice(idx + 2)
          .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
          .join("");
        const match = ascii.match(/\b([0-9]{4}[A-Z][0-9]{3,5})\b/);
        if (match) swVersion = match[1]!;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const raw90 = await elm.sendPayload("1A90", 1_800);
    const bytes = extractHexTokens(raw90);
    const idx = bytes.findIndex((b, i) => b === 0x5a && bytes[i + 1] === 0x90);
    if (idx >= 0) {
      const ascii = bytes
        .slice(idx + 2)
        .map((b) => (b >= 0x30 && b <= 0x5a ? String.fromCharCode(b) : ""))
        .join("");
      if (ascii.length >= 17) vin = ascii.slice(0, 17);
    }
  } catch {
    /* ignore */
  }

  return { partNumber, swVersion, vin, diagVersion, supplierId };
}

/**
 * Poll Mitsubishi AT / CVT Transmission (`7E1 -> 7E9`) for ATF/CVT temperature, current gear,
 * disengaged gear state (`P/N`), shaft RPMs, and torque converter slip.
 */
export async function readMitsubishiTransmission(elm: Elm327Client): Promise<MitsubishiTcmTelemetry> {
  await openMitsubishiKwpSession(elm, 0x7e1, 0x7e9, "1092");
  try {
    const passport = await readMitsubishiKwpPassport(elm);

    const raw2102 = await elm.sendPayload("2102", 2_500);
    const data2102 = extractKwp21Data(raw2102, 0x02);

    let raw2104: string | null = null;
    let data2104: number[] | null = null;
    try {
      raw2104 = await elm.sendPayload("2104", 2_000);
      data2104 = extractKwp21Data(raw2104, 0x04);
    } catch {
      /* optional on some TCMs */
    }

    if (data2102 && data2102.length >= 8) {
      const decoded = decodeMitsubishiAt2102And2104(data2102, data2104);
      return {
        ...decoded,
        txHex: "7E1",
        rxHex: "7E9",
        partNumber: passport.partNumber,
        swVersion: passport.swVersion,
        cvtDegradationCount: null,
        raw2102: raw2102.replace(/>/g, "").replace(/\s+/g, " ").trim(),
        raw2104: raw2104 ? raw2104.replace(/>/g, "").replace(/\s+/g, " ").trim() : null,
        raw2103: null,
      };
    }

    // Fallback to Mitsubishi CVT (`21 03`, `21 06`, `21 07`, `21 0E` / `21 0D` / `21 10`)
    const raw2103 = await elm.sendPayload("2103", 2_500);
    const data2103 = extractKwp21Data(raw2103, 0x03);
    if (data2103 && data2103.length >= 6) {
      let data2106: number[] | null = null;
      let data2107: number[] | null = null;
      let data210E: number[] | null = null;
      let data210D: number[] | null = null;
      let data2110: number[] | null = null;
      try {
        data2106 = extractKwp21Data(await elm.sendPayload("2106", 1_800), 0x06);
        data2107 = extractKwp21Data(await elm.sendPayload("2107", 1_800), 0x07);
        data210E = extractKwp21Data(await elm.sendPayload("210E", 1_800), 0x0e);
        if (!data210E || data210E.length < 30) {
          data210D = extractKwp21Data(await elm.sendPayload("210D", 1_800), 0x0d);
        }
        if (!data210E && !data210D) {
          data2110 = extractKwp21Data(await elm.sendPayload("2110", 1_800), 0x10);
        }
      } catch {
        /* ignore */
      }
      const cvt = decodeMitsubishiCvt({ data2103, data2106, data2107, data210E, data210D, data2110 });
      return {
        ...cvt,
        txHex: "7E1",
        rxHex: "7E9",
        partNumber: passport.partNumber,
        swVersion: passport.swVersion,
        raw2102: null,
        raw2104: null,
        raw2103: raw2103.replace(/>/g, "").replace(/\s+/g, " ").trim(),
      };
    }

    throw new Error(
      `Блок АКПП/CVT (7E1 → 7E9) не вернул данные на 21 02 / 21 03 (${raw2102.replace(/>/g, "").trim() || "NO DATA"}). Проверьте, что зажигание включено (ON).`,
    );
  } finally {
    await closeMitsubishiKwpSession(elm);
  }
}

const DEFAULT_WHEEL_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Колесо 1 (Пер. левое / FL)",
  2: "Колесо 2 (Пер. правое / FR)",
  3: "Колесо 3 (Задн. правое / RR)",
  4: "Колесо 4 (Задн. левое / RL)",
  5: "Колесо 5 (Запаска / Spare)",
};

function decodeMitsubishiTpmsTemp(rawT: number): number | null {
  if (rawT === 0xff || rawT === 0x00) return null;
  const as50 = rawT - 50;
  const as40 = rawT - 40;
  if (as50 >= -30 && as50 <= 95) return as50;
  if (as40 >= -30 && as40 <= 95) return as40;
  return as50;
}

/** Decode P/T byte pair from KWP 21 xx or UDS 22 102x (several MUT scaling variants). */
export function decodeMitsubishiTpmsWheelBytes(rawP: number, rawT: number): {
  pressureBar: number | null;
  pressureKpa: number | null;
  pressurePsi: number | null;
  temperatureC: number | null;
  statusText: string;
} {
  if (rawP === 0xff || rawP === 0x00) {
    return {
      pressureBar: null,
      pressureKpa: null,
      pressurePsi: null,
      temperatureC: rawT !== 0xff ? decodeMitsubishiTpmsTemp(rawT) : null,
      statusText: "Нет давления (0/FF) — датчик спит или нет связи; поездка >30 км/ч",
    };
  }

  let best: { kpa: number; bar: number; psi: number } | null = null;
  for (const mul of [1.373, 2.5, 1.0]) {
    const kpa = Math.round(rawP * mul);
    const bar = Number((kpa / 100).toFixed(2));
    if (bar >= 0.9 && bar <= 5) {
      best = { kpa, bar, psi: Number((kpa * 0.145038).toFixed(1)) };
      break;
    }
  }
  if (!best && rawP >= 90 && rawP <= 350) {
    best = {
      kpa: rawP,
      bar: Number((rawP / 100).toFixed(2)),
      psi: Number((rawP * 0.145038).toFixed(1)),
    };
  }
  if (!best) {
    const subaruStyle = decodeSubaruTpmsBytes([rawP, rawT]);
    if (subaruStyle && subaruStyle.bar >= 0.9 && subaruStyle.bar <= 5) {
      return {
        pressureBar: subaruStyle.bar,
        pressureKpa: Math.round(subaruStyle.kpa),
        pressurePsi: subaruStyle.psi,
        temperatureC: subaruStyle.temperatureC,
        statusText: "OK (UDS-style)",
      };
    }
    return {
      pressureBar: null,
      pressureKpa: null,
      pressurePsi: null,
      temperatureC: decodeMitsubishiTpmsTemp(rawT),
      statusText: `Сырые P=${rawP} T=${rawT} — не удалось масштабировать`,
    };
  }
  return {
    pressureBar: best.bar,
    pressureKpa: best.kpa,
    pressurePsi: best.psi,
    temperatureC: decodeMitsubishiTpmsTemp(rawT),
    statusText: "OK",
  };
}

async function readTpmsWheelsUds(
  elm: Elm327Client,
  tx: number,
  rx: number,
): Promise<{ wheels: TpmsWheelReading[]; rawHex: string } | null> {
  await elm.setCanHeader(tx, rx);
  try {
    await elm.sendPayload("3E00", 800);
  } catch {
    /* ignore */
  }
  try {
    await elm.sendPayload("1003", 1_200);
  } catch {
    try {
      await elm.sendPayload("1092", 1_200);
    } catch {
      /* ignore */
    }
  }
  const wheels: TpmsWheelReading[] = [];
  const rawParts: string[] = [];
  for (const [idx, didHex] of (["1021", "1022", "1023", "1024"] as const).entries()) {
    const wheelIndex = (idx + 1) as 1 | 2 | 3 | 4;
    try {
      const raw = await elm.sendPayload(`22${didHex}`, 1_400);
      const parsed = parseUdsResponse(raw, 0x22);
      if (parsed.kind !== "positive" || parsed.payload.length < 3) {
        wheels.push({
          wheelIndex,
          defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
          sensorIdHex: null,
          pressureBar: null,
          pressureKpa: null,
          pressurePsi: null,
          temperatureC: null,
          statusText: "Нет ответа UDS",
        });
        continue;
      }
      const dataBytes = parsed.payload.slice(2);
      rawParts.push(`${didHex}:${dataBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}`);
      const sub = decodeSubaruTpmsBytes(dataBytes);
      const decoded =
        sub && sub.bar >= 0.9
          ? {
              pressureBar: sub.bar,
              pressureKpa: Math.round(sub.kpa),
              pressurePsi: sub.psi,
              temperatureC: sub.temperatureC,
              statusText: "OK (UDS)",
            }
          : dataBytes.length >= 2
            ? decodeMitsubishiTpmsWheelBytes(dataBytes[0]!, dataBytes[1]!)
            : decodeMitsubishiTpmsWheelBytes(dataBytes[0]!, 0xff);
      wheels.push({
        wheelIndex,
        defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
        sensorIdHex: null,
        ...decoded,
      });
    } catch {
      wheels.push({
        wheelIndex,
        defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
        sensorIdHex: null,
        pressureBar: null,
        pressureKpa: null,
        pressurePsi: null,
        temperatureC: null,
        statusText: "Ошибка UDS",
      });
    }
  }
  try {
    await elm.sendPayload("1001", 800);
  } catch {
    /* ignore */
  }
  if (wheels.every((w) => w.pressureBar == null) && rawParts.length === 0) return null;
  return { wheels, rawHex: rawParts.join(" ") || "UDS TPMS" };
}

/**
 * Decode Mitsubishi TPMS sensor data from `773 -> 774` (Pajero Sport III OSS/TPMS) or `600 -> 500` (KOS/TPMS).
 */
export function decodeMitsubishiTpmsPayload(options: {
  lid2101?: number[] | null;
  lid2110?: number[] | null;
  lid2128?: number[] | null;
  individualWheels?: (number[] | null)[];
}): TpmsWheelReading[] {
  const { lid2101, lid2110, lid2128, individualWheels } = options;

  // Extract up to 5 32-bit sensor IDs from 21 28 / 21 A6 (`[statusByte, ID1..ID5]`, 21B) or 21 AE / 21 A2 (`[statusByte, countByte, ID1..ID5]`, 22B)
  const sensorIds: (string | null)[] = [null, null, null, null, null];
  if (lid2128 && lid2128.length >= 16) {
    const startOffset = lid2128.length >= 22 ? 2 : lid2128.length % 4 === 1 ? 1 : 0;
    for (let w = 0; w < 5; w++) {
      const pos = startOffset + w * 4;
      if (pos + 4 <= lid2128.length) {
        const slice = lid2128.slice(pos, pos + 4);
        const isBlank = slice.every((b) => b === 0xff || b === 0x00);
        if (!isBlank) {
          sensorIds[w] = slice.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
        }
      }
    }
  }

  // Case 1: Individual wheel LIDs `21 03`..`21 07` (`TPMS_88800001` bytePos 8 = `data[6]`) or `21 10`..`21 14` / `21 11`..`21 15`
  if (individualWheels && individualWheels.some((w) => w != null && w.length >= 2)) {
    return ([1, 2, 3, 4, 5] as const).map((wheelIndex, idx) => {
      const data = individualWheels[idx];
      if (!data || data.length < 2) {
        return {
          wheelIndex,
          defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
          sensorIdHex: sensorIds[idx] ?? null,
          pressureBar: null,
          pressureKpa: null,
          pressurePsi: null,
          temperatureC: null,
          statusText: "Нет данных",
        };
      }
      // In `TPMS_88800001.exdf` (`21 03`..`21 07`), bytePos 8 (`data[6]`, factor 1.724 kPa / 0.25 psi) is pressure
      const pByte = data.length >= 7 && data[0]! <= 0x05 ? data[6]! : data[0]!;
      const tByte = data.length >= 8 && data[0]! <= 0x05 ? data[7]! : data[1]!;
      const decoded = decodeMitsubishiTpmsWheelBytes(pByte, tByte);
      return {
        wheelIndex,
        defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
        sensorIdHex: sensorIds[idx] ?? null,
        ...decoded,
      };
    });
  }

  // Case 2: Combined frame in `21 01` or `21 10` containing all 4/5 wheels
  const combined = lid2101 && lid2101.length >= 8 ? lid2101 : lid2110 && lid2110.length >= 8 ? lid2110 : null;
  if (combined) {
    const stride = combined.length >= 15 ? Math.floor(combined.length / 5) : 2;
    return ([1, 2, 3, 4, 5] as const).map((wheelIndex, idx) => {
      const offset = idx * stride;
      if (offset + 1 >= combined.length) {
        return {
          wheelIndex,
          defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
          sensorIdHex: sensorIds[idx] ?? null,
          pressureBar: null,
          pressureKpa: null,
          pressurePsi: null,
          temperatureC: null,
          statusText: "Не используется",
        };
      }
      const decoded = decodeMitsubishiTpmsWheelBytes(combined[offset]!, combined[offset + 1]!);
      return {
        wheelIndex,
        defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
        sensorIdHex: sensorIds[idx] ?? null,
        ...decoded,
      };
    });
  }

  // Case 3: Only sensor IDs from `21 28` available
  return ([1, 2, 3, 4, 5] as const).map((wheelIndex, idx) => ({
    wheelIndex,
    defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
    sensorIdHex: sensorIds[idx] ?? null,
    pressureBar: null,
    pressureKpa: null,
    pressurePsi: null,
    temperatureC: null,
    statusText: sensorIds[idx] ? `ID прописан (${sensorIds[idx]})` : "Не прописан",
  }));
}

/**
 * Pajero Sport / Outlander OSS-KOS tyre frame (`21 A1`–`A5`, `21 23`–`27`, `21 36`–`3A`).
 * MUT bytePos 10 is pressure (×1.379 kPa) and bytePos 11 is temperature (A−50).
 * `extractKwp21Data` already drops `61` and the LID, so those positions are indexes 8 and 9.
 */
export function decodeMitsubishiOssTyreData(data: number[] | null | undefined): {
  idReceived: boolean;
  pressureBar: number | null;
  pressureKpa: number | null;
  pressurePsi: number | null;
  temperatureC: number | null;
} | null {
  if (!data || data.length < 9) return null;
  const idReceived = data[0] === 0x01;
  const rawP = data[8]!;
  const rawT = data[9];
  const temperatureC = rawT == null || rawT === 0xff ? null : rawT - 50;
  if (rawP === 0x00 || rawP === 0xff) {
    return { idReceived, pressureBar: null, pressureKpa: null, pressurePsi: null, temperatureC };
  }
  const pressureKpa = Math.round(rawP * 1.379);
  return {
    idReceived,
    pressureKpa,
    pressureBar: Number((pressureKpa / 100).toFixed(2)),
    pressurePsi: Number((pressureKpa * 0.145038).toFixed(1)),
    temperatureC,
  };
}

/** Five tyre frames from one LID family. Returns null when none of them carries the pressure byte. */
export function decodeMitsubishiOssTyreSet(frames: (number[] | null | undefined)[]): TpmsWheelReading[] | null {
  if (!frames.some((frame) => frame != null && frame.length >= 9)) return null;
  return ([1, 2, 3, 4, 5] as const).map((wheelIndex, index) => {
    const decoded = decodeMitsubishiOssTyreData(frames[index]);
    const active = decoded?.pressureBar != null || Boolean(decoded?.idReceived);
    return {
      wheelIndex,
      defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
      sensorIdHex: null,
      pressureBar: decoded?.pressureBar ?? null,
      pressureKpa: decoded?.pressureKpa ?? null,
      pressurePsi: decoded?.pressurePsi ?? null,
      temperatureC: decoded?.temperatureC ?? null,
      batteryStatus: active ? "ok" : "unknown",
      batteryText: active ? "Батарея: ОК" : null,
      statusText: decoded?.pressureBar != null ? "OK" : frames[index] ? "Нет давления" : "Нет данных",
    };
  });
}

/**
 * Applies MUT-III SE transmitter battery & mode DTCs (`C1910..C1950` Battery voltage, `C1915..C1955` OFF mode, `C1911..C1951` ID reception fail)
 * from `18 00 FF 00` to the 5 TPMS wheel readings.
 */
export function applyMitsubishiTpmsDtcStatus(
  wheels: TpmsWheelReading[],
  dtcCodes: readonly string[],
  dtcReadSucceeded = true,
): TpmsWheelReading[] {
  const codeSet = new Set(dtcCodes.map((c) => c.trim().toUpperCase()));
  return wheels.map((wheel) => {
    const i = wheel.wheelIndex;
    const lowBattCode = `C19${i}0`;
    const noRxCode = `C19${i}1`;
    const offModeCode = `C19${i}5`;

    if (codeSet.has(lowBattCode)) {
      return {
        ...wheel,
        batteryStatus: "low",
        batteryText: `Батарея разряжена (${lowBattCode})`,
      };
    }
    if (codeSet.has(offModeCode)) {
      return {
        ...wheel,
        batteryStatus: "off",
        batteryText: `Спящий режим OFF (${offModeCode})`,
      };
    }
    if (codeSet.has(noRxCode) && wheel.pressureBar == null) {
      return {
        ...wheel,
        batteryStatus: "unknown",
        batteryText: `Нет связи (${noRxCode})`,
      };
    }
    if (wheel.pressureBar != null || (dtcReadSucceeded && wheel.batteryStatus === "ok")) {
      return {
        ...wheel,
        batteryStatus: "ok",
        batteryText: "Батарея: ОК",
      };
    }
    return wheel;
  });
}

/**
 * Read TPMS Tire Pressures, Temperatures, and Registered Sensor IDs on Mitsubishi (`773->774` OSS/TPMS or `600->500` KOS/TPMS)
 * or Subaru (`752->75A` BIU/TPMS).
 */
export async function readTpmsSensors(
  elm: Elm327Client,
  target: "mitsubishi-auto" | "mitsubishi-773" | "mitsubishi-600" | "subaru-752",
): Promise<TpmsModuleReport> {
  if (target === "subaru-752") {
    await elm.setCanHeader(0x752, 0x75a);
    try {
      await elm.sendPayload("1003", 1_200);
    } catch {
      /* ignore */
    }
    const wheels: TpmsWheelReading[] = [];
    const rawParts: string[] = [];
    let partNumber: string | null = null;
    try {
      const r8e = await elm.sendPayload("22F18E", 1_000);
      const p8e = parseUdsResponse(r8e, 0x22);
      if (p8e.kind === "positive" && p8e.payload.length > 2) {
        partNumber = p8e.payload
          .slice(2)
          .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
          .join("")
          .trim();
      }
    } catch {
      /* ignore */
    }

    for (const [idx, didHex] of (["1021", "1022", "1023", "1024"] as const).entries()) {
      const wheelIndex = (idx + 1) as 1 | 2 | 3 | 4;
      try {
        const raw = await elm.sendPayload(`22${didHex}`, 1_200);
        const parsed = parseUdsResponse(raw, 0x22);
        if (parsed.kind === "positive" && parsed.payload.length >= 3) {
          const dataBytes = parsed.payload.slice(2);
          const decoded = decodeSubaruTpmsBytes(dataBytes);
          rawParts.push(
            `${didHex}:${dataBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}`,
          );
          wheels.push({
            wheelIndex,
            defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
            sensorIdHex: null,
            pressureBar: decoded?.bar ?? null,
            pressureKpa: decoded ? Math.round(decoded.kpa) : null,
            pressurePsi: decoded?.psi ?? null,
            temperatureC: decoded?.temperatureC ?? null,
            statusText: decoded ? "OK" : "Нет давления",
          });
        } else {
          wheels.push({
            wheelIndex,
            defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
            sensorIdHex: null,
            pressureBar: null,
            pressureKpa: null,
            pressurePsi: null,
            temperatureC: null,
            statusText: "Нет ответа",
          });
        }
      } catch {
        wheels.push({
          wheelIndex,
          defaultLabel: DEFAULT_WHEEL_NAMES[wheelIndex],
          sensorIdHex: null,
          pressureBar: null,
          pressureKpa: null,
          pressurePsi: null,
          temperatureC: null,
          statusText: "Ошибка",
        });
      }
    }
    try {
      await elm.sendPayload("1001", 800);
    } catch {
      /* ignore */
    }
    return {
      brand: "subaru",
      moduleName: "Subaru BIU / TPMS (752 → 75A)",
      txHex: "752",
      rxHex: "75A",
      partNumber,
      activeSet: 1,
      wheels,
      rawHex: rawParts.join(" "),
    };
  }

  // Mitsubishi TPMS: probe 773->774 (Pajero Sport III OSS/TPMS) first, then 600->500 (Outlander/ASX KOS/TPMS)
  const candidates: { tx: number; rx: number; name: string }[] =
    target === "mitsubishi-773"
      ? [{ tx: 0x773, rx: 0x774, name: "Mitsubishi OSS / TPMS (773 → 774 · Pajero Sport III)" }]
      : target === "mitsubishi-600"
        ? [{ tx: 0x600, rx: 0x500, name: "Mitsubishi KOS / TPMS (600 → 500 · Outlander / ASX)" }]
        : [
            { tx: 0x600, rx: 0x500, name: "Mitsubishi KOS / TPMS (600 → 500 · Outlander / ASX)" },
            { tx: 0x773, rx: 0x774, name: "Mitsubishi OSS / TPMS (773 → 774 · Pajero Sport III)" },
            { tx: 0x620, rx: 0x504, name: "Mitsubishi ETACS (620 → 504 · UDS/KWP)" },
          ];

  let lastErr = "Нет ответа от блока TPMS (773→774 / 600→500)";
  for (const mod of candidates) {
    await openMitsubishiKwpSession(elm, mod.tx, mod.rx, "1092");
    try {
      const passport = await readMitsubishiKwpPassport(elm);
      const rawLogs: string[] = [];

      let lid2101: number[] | null = null;
      let lid2110: number[] | null = null;
      let lid2128: number[] | null = null;
      const individualWheels: (number[] | null)[] = [null, null, null, null, null];

      const readLid = async (lid: number): Promise<number[] | null> => {
        const lidHex = lid.toString(16).padStart(2, "0").toUpperCase();
        try {
          const raw = await elm.sendPayload(`21${lidHex}`, 1_400);
          const data = extractKwp21Data(raw, lid);
          if (data && data.length > 0) {
            rawLogs.push(
              `21${lidHex}: ${data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}`,
            );
            return data;
          }
        } catch {
          /* try next LID */
        }
        return null;
      };

      let ossWheels: TpmsWheelReading[] | null = null;
      for (const lids of [
        [0xa1, 0xa2, 0xa3, 0xa4, 0xa5],
        [0x23, 0x24, 0x25, 0x26, 0x27],
        [0x36, 0x37, 0x38, 0x39, 0x3a],
      ]) {
        const first = await readLid(lids[0]!);
        if (!first || first.length < 9) continue;
        const frames: (number[] | null)[] = [first];
        for (const lid of lids.slice(1)) frames.push(await readLid(lid));
        ossWheels = decodeMitsubishiOssTyreSet(frames);
        if (ossWheels?.some((wheel) => wheel.pressureBar != null)) break;
        ossWheels = null;
      }

      if (ossWheels) {
        for (const idLid of [0x28, 0xa6, 0xae]) {
          lid2128 = await readLid(idLid);
          if (lid2128 && lid2128.length >= 16) break;
        }
      } else {
        for (const lid of [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x28, 0xa6, 0xae]) {
          const data = await readLid(lid);
          if (!data) continue;
          if (lid === 0x01) lid2101 = data;
          else if (lid >= 0x03 && lid <= 0x07 && data.length >= 7) {
            individualWheels[lid - 0x03] = data;
          } else if (lid >= 0x02 && lid <= 0x05 && data.length >= 2) {
            individualWheels[lid - 0x02] = data;
          } else if (lid === 0x10) {
            lid2110 = data;
            if (data.length <= 6) individualWheels[0] = data;
          } else if (lid >= 0x11 && lid <= 0x15) {
            individualWheels[lid - 0x11] = data;
          } else if (lid === 0x28 || lid === 0xa6 || lid === 0xae) {
            if (!lid2128 || lid2128.length < 16) lid2128 = data;
          }
        }
      }

      let tpmsDtcCodes: string[] = [];
      let tpmsDtcReadOk = false;
      try {
        const raw18 = await elm.sendPayload("1800FF00", 1_400);
        const p18 = parseUdsResponse(raw18, 0x18);
        if (p18.kind === "positive") {
          tpmsDtcReadOk = true;
          tpmsDtcCodes = parseKwpDtcs18(p18.payload).map((d) => d.code);
          if (tpmsDtcCodes.length > 0) {
            rawLogs.push(`1800FF00: ${tpmsDtcCodes.join(",")}`);
          }
        }
      } catch {
        /* optional DTC read for transmitter battery status */
      }

      const legacy = decodeMitsubishiTpmsPayload({
        lid2101,
        lid2110,
        lid2128,
        individualWheels: individualWheels.some(Boolean) ? individualWheels : undefined,
      });
      const mergedWheels = (ossWheels ?? legacy).map((wheel, index) => ({
        ...wheel,
        sensorIdHex: wheel.sensorIdHex ?? legacy[index]?.sensorIdHex ?? null,
      }));
      const wheels = applyMitsubishiTpmsDtcStatus(mergedWheels, tpmsDtcCodes, tpmsDtcReadOk);
      const hasReading = wheels.some((wheel) => wheel.pressureBar != null || wheel.sensorIdHex);
      if (hasReading) {
        return {
          brand: "mitsubishi",
          moduleName: mod.name,
          txHex: mod.tx.toString(16).toUpperCase(),
          rxHex: mod.rx.toString(16).toUpperCase(),
          partNumber: passport.partNumber,
          activeSet: 1,
          wheels,
          rawHex: rawLogs.join(" | ") || "Паспорт считан",
        };
      }
      if (passport.partNumber) {
        lastErr = `${mod.name} ответил (${passport.partNumber}), но кадры давления 21 A1–A5 / 23–27 пустые`;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    } finally {
      await closeMitsubishiKwpSession(elm);
    }

    const udsAttempt = await readTpmsWheelsUds(elm, mod.tx, mod.rx);
    if (udsAttempt && udsAttempt.wheels.some((w) => w.pressureBar != null)) {
      return {
        brand: "mitsubishi",
        moduleName: `${mod.name} · UDS 22 1021–1024`,
        txHex: mod.tx.toString(16).toUpperCase(),
        rxHex: mod.rx.toString(16).toUpperCase(),
        partNumber: null,
        activeSet: 1,
        wheels: udsAttempt.wheels,
        rawHex: udsAttempt.rawHex,
      };
    }
  }

  for (const mod of [
    { tx: 0x620, rx: 0x504, name: "Mitsubishi ETACS (620 → 504)" },
    { tx: 0x7a1, rx: 0x509, name: "Mitsubishi ETACS alt (7A1 → 509)" },
  ]) {
    try {
      const udsAttempt = await readTpmsWheelsUds(elm, mod.tx, mod.rx);
      if (udsAttempt && udsAttempt.wheels.some((w) => w.pressureBar != null)) {
        return {
          brand: "mitsubishi",
          moduleName: `${mod.name} · UDS TPMS`,
          txHex: mod.tx.toString(16).toUpperCase(),
          rxHex: mod.rx.toString(16).toUpperCase(),
          partNumber: null,
          activeSet: 1,
          wheels: udsAttempt.wheels,
          rawHex: udsAttempt.rawHex,
        };
      }
    } catch {
      /* next */
    }
  }

  throw new Error(lastErr);
}

function decodeSasSteeringWord(data: number[]): number | null {
  if (data.length < 2) return null;
  const u16 = (data[0]! << 8) | data[1]!;
  const angle =
    u16 >= 0x0800 && u16 <= 0x1800
      ? Number(((u16 - 4096) * 0.5).toFixed(1))
      : Number(((u16 >= 0x8000 ? u16 - 0x10000 : u16) / 10).toFixed(1));
  return Math.abs(angle) <= 720 ? angle : null;
}

/**
 * ABS/ASC Data List «Steering wheel angle sensor» (`ASC_42000018.exdf`..`ASC_42880012.exdf`):
 * `21 02`, `byte_pos = 2, byte_len = 2, byte_order = 2` (Big-Endian), `code_type = 1` (signed 2's complement), `factor = 0.1°`.
 * Falls back to Little-Endian only if the Big-Endian value exceeds ±720°.
 */
function decodeAbsSteeringWord(data: number[]): number | null {
  if (data.length < 2) return null;
  const wordBe = (data[0]! << 8) | data[1]!;
  const signedBe = wordBe >= 0x8000 ? wordBe - 0x10000 : wordBe;
  const angleBe = Number((signedBe * 0.1).toFixed(1));
  if (Math.abs(angleBe) <= 720) return angleBe;
  const wordLe = data[0]! | (data[1]! << 8);
  const signedLe = wordLe >= 0x8000 ? wordLe - 0x10000 : wordLe;
  const angleLe = Number((signedLe * 0.1).toFixed(1));
  return Math.abs(angleLe) <= 720 ? angleLe : null;
}

/**
 * Pick the steering sample. ABS `21 01` often answers `00 00` while the angle sits on `21 02`.
 * A real angle wins over a zero frame; a centered wheel still returns 0° from the preferred LID.
 */
export function pickMitsubishiSteeringAngle(
  source: "sas-622" | "abs-784",
  frames: { lid: number; data: number[] }[],
): { lid: number; data: number[]; angleDeg: number } | null {
  const preferred = source === "abs-784" ? 0x02 : 0x01;
  let best: { lid: number; data: number[]; angleDeg: number; rank: number } | null = null;
  for (const frame of frames) {
    const angleDeg =
      source === "abs-784"
        ? frame.lid === 0x02
          ? decodeAbsSteeringWord(frame.data)
          : null
        : frame.lid === 0x01
          ? decodeSasSteeringWord(frame.data)
          : null;
    if (angleDeg == null) continue;
    const rank = angleDeg !== 0 ? 2 : frame.lid === preferred ? 1 : 0;
    if (!best || rank > best.rank) best = { ...frame, angleDeg, rank };
  }
  return best ? { lid: best.lid, data: best.data, angleDeg: best.angleDeg } : null;
}

/**
 * Read Steering Wheel Angle Sensor (SAS) on Mitsubishi (`622 -> 484` SAS or `784 -> 785` ABS/ASC).
 */
export async function readMitsubishiSteeringAngle(
  elm: Elm327Client,
  source: "sas-622" | "abs-784" = "sas-622",
): Promise<MitsubishiSteeringReport> {
  const tx = source === "sas-622" ? 0x622 : 0x784;
  const rx = source === "sas-622" ? 0x484 : 0x785;
  await openMitsubishiKwpSession(elm, tx, rx, "1092");
  try {
    const passport = await readMitsubishiKwpPassport(elm);
    const frames: { lid: number; data: number[] }[] = [];
    for (const lid of [0x02, 0x01, 0x04, 0x03]) {
      try {
        const raw = await elm.sendPayload(`21${lid.toString(16).padStart(2, "0").toUpperCase()}`, 1_800);
        const data = extractKwp21Data(raw, lid);
        if (data && data.length >= 2) frames.push({ lid, data });
      } catch {
        /* this LID is absent on this block */
      }
    }
    const picked = pickMitsubishiSteeringAngle(source, frames);
    if (!picked) {
      throw new Error(
        `Блок ${tx.toString(16).toUpperCase()}→${rx.toString(16).toUpperCase()} не вернул угол руля на 21 02 / 21 01`,
      );
    }
    const lidHex = picked.lid.toString(16).padStart(2, "0").toUpperCase();
    return {
      source,
      txHex: tx.toString(16).toUpperCase(),
      rxHex: rx.toString(16).toUpperCase(),
      partNumber: passport.partNumber,
      angleDeg: picked.angleDeg,
      angularSpeedDegPerSec: picked.lid === 0x01 && picked.data.length >= 3 ? picked.data[2]! : null,
      calibrated: true,
      rawHex: `21 ${lidHex} → ${picked.data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}`,
    };
  } finally {
    await closeMitsubishiKwpSession(elm);
  }
}

/**
 * Execute Mitsubishi Steering Wheel Angle Sensor (SAS) Zero-Point Calibration (`622 -> 484` + `784 -> 785` ABS/ASC reset).
 * Verified against MMCodingWriter / MUT-III procedure:
 * 1. `622 -> 484`: `10 92` -> `31 02` (`71 02 00`) -> `31 01` (`71 01 00`) -> `10 81`
 * 2. `784 -> 785`: `10 92` -> `11 01` (`51`) -> `10 81`
 */
export async function calibrateMitsubishiSasZero(elm: Elm327Client): Promise<SasCalibrationResult> {
  const steps: string[] = [];
  await openMitsubishiKwpSession(elm, 0x622, 0x484, "1092");
  steps.push("622→484: Открыта диагностическая сессия SAS (10 92)");

  try {
    const raw3102 = await elm.sendPayload("3102", 3_000);
    const tok3102 = extractHexTokens(raw3102);
    steps.push(`622→484: Старт калибровки нуля (31 02) → ${raw3102.replace(/>/g, "").trim()}`);
    if (!tok3102.includes(0x71)) {
      throw new Error(`Блок SAS 622 отклонил старт калибровки 31 02: ${raw3102.replace(/>/g, "").trim()}`);
    }

    const raw3101 = await elm.sendPayload("3101", 3_000);
    const tok3101 = extractHexTokens(raw3101);
    steps.push(`622→484: Фиксация нулевой точки (31 01) → ${raw3101.replace(/>/g, "").trim()}`);
    if (!tok3101.includes(0x71)) {
      throw new Error(`Блок SAS 622 не подтвердил фиксацию 31 01: ${raw3101.replace(/>/g, "").trim()}`);
    }
  } finally {
    await closeMitsubishiKwpSession(elm);
    steps.push("622→484: Сессия SAS закрыта (10 81)");
  }

  // Reboot ABS/ASC (784 -> 785) so it latches the new SAS zero offset
  try {
    await openMitsubishiKwpSession(elm, 0x784, 0x785, "1092");
    const raw1101 = await elm.sendPayload("1101", 2_500);
    steps.push(`784→785: Перезапуск ABS/ASC (11 01) → ${raw1101.replace(/>/g, "").trim()}`);
  } catch {
    steps.push("784→785: Перезапуск ABS/ASC пропущен (не требуется на данной модификации)");
  } finally {
    await closeMitsubishiKwpSession(elm);
  }

  return {
    success: true,
    steps,
    finalAngleDeg: 0.0,
  };
}

/**
 * Read Mitsubishi Combination Meter (`6A0 -> 514`):
 * - `21 A3`: Fuel level in tank (`(C - 16) * 0.7` liters on Pajero Sport III / Outlander)
 * - `21 AD`: Odometer, MUT byteOrder 1 (little-endian). Big-endian is kept only when the little-endian value is not a mileage.
 */
export function decodeMitsubishiOdometerKm(data: number[] | null | undefined): number | null {
  if (!data || data.length < 3) return null;
  const little =
    data[0]! + (data[1]! << 8) + (data[2]! << 16);
  const big = (data[0]! << 16) | (data[1]! << 8) | data[2]!;
  if (little <= 999_999) return little;
  if (big <= 999_999) return big;
  return null;
}

export async function readMitsubishiMeter(elm: Elm327Client): Promise<MitsubishiMeterReport> {
  await openMitsubishiKwpSession(elm, 0x6a0, 0x514, "1092");
  try {
    const passport = await readMitsubishiKwpPassport(elm);
    let fuelLiters: number | null = null;
    let fuelPercent: number | null = null;
    let fuelSensorOhm: number | null = null;
    let fuelRawByte: number | null = null;
    let rawFuelHex: string | null = null;
    let odometerKm: number | null = null;
    let rawOdoHex: string | null = null;

    for (const fuelLid of [0xa3, 0xc3]) {
      try {
        const lidHex = fuelLid.toString(16).padStart(2, "0").toUpperCase();
        const rawFuel = await elm.sendPayload(`21${lidHex}`, 2_000);
        const dataFuel = extractKwp21Data(rawFuel, fuelLid);
        if (dataFuel && dataFuel.length >= 1) {
          rawFuelHex = dataFuel.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          if (dataFuel.length >= 3) {
            const rawOhm = dataFuel[0]! + (dataFuel[1]! << 8);
            if (rawOhm > 0 && rawOhm < 0xffff) {
              fuelSensorOhm = Number((rawOhm * 0.1).toFixed(1));
            }
          }
          const cByte = dataFuel.length >= 3 ? dataFuel[2]! : dataFuel[0]!;
          fuelRawByte = cByte;
          fuelPercent = Math.max(0, Math.min(100, cByte - 16));
          fuelLiters = Math.max(0, Number(((cByte - 16) * 0.7).toFixed(1)));
          break;
        }
      } catch {
        /* try next fuel LID */
      }
    }

    for (const odoLid of [0xad, 0xcd]) {
      try {
        const lidHex = odoLid.toString(16).padStart(2, "0").toUpperCase();
        const rawOdo = await elm.sendPayload(`21${lidHex}`, 2_000);
        const dataOdo = extractKwp21Data(rawOdo, odoLid);
        if (dataOdo && dataOdo.length >= 3) {
          rawOdoHex = dataOdo.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          odometerKm = decodeMitsubishiOdometerKm(dataOdo);
          if (odometerKm != null) break;
        }
      } catch {
        /* try next odometer LID */
      }
    }

    return {
      txHex: "6A0",
      rxHex: "514",
      partNumber: passport.partNumber,
      vin: passport.vin,
      fuelLiters,
      fuelPercent,
      fuelSensorOhm,
      fuelRawByte,
      odometerKm,
      rawFuelHex,
      rawOdoHex,
    };
  } finally {
    await closeMitsubishiKwpSession(elm);
  }
}

export interface DecodedBroadcastSignal {
  idHex: string;
  title: string;
  summary: string;
  values: { label: string; value: string }[];
}

/**
 * Decode passive CAN broadcast frames on Mitsubishi & Subaru (captured via `ATMA` / `ATCRA`).
 * Covers:
 * - `0x236`: Steering Wheel Angle & Angular Velocity
 * - `0x318`: Transmission Gear & Selector Position
 * - `0x32F`: Electronic Parking Brake (EPB)
 * - `0x208`: Brake Pedal Pressure & Wheel Speeds
 * - `0x210`: Accelerator Pedal Position (`C * 100 / 255 %`)
 * - `0x214` / `0x215`: ABS Individual Wheel Speeds (`(A*256+B)/2`)
 * - `0x154`: Real Fuel Level (`A*100/255 %`), Dash Fuel (`B*100/255 %`), Odometer (`((F*256+G)*256+H)/10 km`)
 * - `0x328`: Vehicle Speed (`(A*256+B)/2 km/h`)
 * - `0x608`: Coolant Temp (`A - 40 °C`) & Ambient Temp (`B - 40 °C`)
 */
export function decodeCanBroadcastFrame(idHex: string, data: number[]): DecodedBroadcastSignal | null {
  const cleanId = idHex.replace(/^0+/, "").toUpperCase() || "0";
  const A = data[0];
  const B = data[1];
  const C = data[2];
  const D = data[3];
  const E = data[4];
  const F = data[5];
  const G = data[6];
  const H = data[7];

  if (cleanId === "236" && A != null && B != null) {
    const u16 = (A << 8) | B;
    const angleDeg =
      u16 >= 0x0400 && u16 <= 0x1c00
        ? Number(((u16 - 4096) * 0.5).toFixed(1))
        : Number(((u16 >= 0x8000 ? u16 - 0x10000 : u16) * 0.1).toFixed(1));
    const speed = C != null ? `${C} ед/с` : "—";
    return {
      idHex: "236",
      title: "Датчик угла поворота руля (SAS 0x236)",
      summary: `Угол: ${angleDeg > 0 ? `+${angleDeg}` : angleDeg}° · Скорость: ${speed}`,
      values: [
        { label: "Угол руля", value: `${angleDeg > 0 ? `+${angleDeg}` : angleDeg}°` },
        { label: "Скорость вращения", value: speed },
      ],
    };
  }

  if (cleanId === "318" && A != null) {
    const selMap: Record<number, string> = {
      0x50: "P (Паркинг — передача выключена)",
      0x52: "R (Задний ход)",
      0x4e: "N (Нейтраль — передача выключена)",
      0x44: "D (Движение)",
      0x00: "P / N (Выключена)",
      0x01: "P (Паркинг)",
      0x02: "R (Задний ход)",
      0x03: "N (Нейтраль)",
      0x04: "D (Движение)",
    };
    const gearByte = B ?? A;
    const selText = selMap[A] ?? `Код 0x${A.toString(16).toUpperCase()}`;
    return {
      idHex: "318",
      title: "Коробка передач / Селектор АКПП (0x318)",
      summary: `${selText} · Байт ступени: 0x${gearByte.toString(16).padStart(2, "0").toUpperCase()}`,
      values: [
        { label: "Селектор", value: selText },
        { label: "Ступень (байт B)", value: `${gearByte & 0x0f}` },
      ],
    };
  }

  if (cleanId === "32F" && A != null) {
    const engaged = (A & 0x03) !== 0 || (B != null && (B & 0x01) !== 0);
    return {
      idHex: "32F",
      title: "Электронный стояночный тормоз EPB (0x32F)",
      summary: engaged ? "Ручник ЗАТЯНУТ" : "Ручник ОТПУЩЕН",
      values: [{ label: "Статус EPB", value: engaged ? "Затянут" : "Отпущен" }],
    };
  }

  if (cleanId === "210" && C != null) {
    const pedalPct = Math.round((C * 100) / 255);
    return {
      idHex: "210",
      title: "Педаль акселератора (0x210)",
      summary: `Нажатие газа: ${pedalPct}%`,
      values: [{ label: "Педаль газа", value: `${pedalPct}%` }],
    };
  }

  if (cleanId === "208" && C != null && D != null) {
    const brk = ((C & 0x0f) << 8) | D;
    const spd1 = E != null && F != null ? (E << 8) | F : null;
    return {
      idHex: "208",
      title: "Тормозная система и скорость (0x208)",
      summary: `Тормоз: ${brk} ед.${spd1 != null ? ` · Скор.: ${spd1}` : ""}`,
      values: [{ label: "Давление тормоза", value: String(brk) }],
    };
  }

  if ((cleanId === "214" || cleanId === "215") && A != null && B != null && C != null && D != null) {
    const spd = ((A << 8) | B) / 2;
    const wA = (C << 8) | D;
    const wB = E != null && F != null ? (E << 8) | F : null;
    const labelPrefix = cleanId === "214" ? "Передние колёса" : "Задние колёса";
    return {
      idHex: cleanId,
      title: `Датчики скорости колёс ABS (0x${cleanId} · ${labelPrefix})`,
      summary: `Скорость: ${spd.toFixed(1)} · Колесо 1: ${wA}${wB != null ? ` · Колесо 2: ${wB}` : ""}`,
      values: [
        { label: "Скорость оси", value: `${spd.toFixed(1)}` },
        { label: "Левое колесо", value: String(wA) },
        { label: "Правое колесо", value: wB != null ? String(wB) : "—" },
      ],
    };
  }

  if (cleanId === "154" && A != null && B != null) {
    const fuelRealPct = Math.round((A * 100) / 255);
    const fuelDashPct = Math.round((B * 100) / 255);
    const odoKm =
      F != null && G != null && H != null ? (((F << 16) | (G << 8) | H) / 10).toFixed(1) : null;
    return {
      idHex: "154",
      title: "Топливный бак и одометр в шине (0x154)",
      summary: `Бак реал.: ${fuelRealPct}% (приборка ${fuelDashPct}%)${odoKm ? ` · Пробег: ${odoKm} км` : ""}`,
      values: [
        { label: "Топливо (датчик)", value: `${fuelRealPct}%` },
        { label: "Топливо (стрелка)", value: `${fuelDashPct}%` },
        ...(odoKm ? [{ label: "Одометр", value: `${odoKm} км` }] : []),
      ],
    };
  }

  if (cleanId === "608" && A != null && B != null) {
    const coolant = A - 40;
    const ambient = B - 40;
    return {
      idHex: "608",
      title: "Температура ДВС и улицы (0x608)",
      summary: `ОЖ: ${coolant} °C · За бортом: ${ambient} °C`,
      values: [
        { label: "Температура ОЖ", value: `${coolant} °C` },
        { label: "Наружная температура", value: `${ambient} °C` },
      ],
    };
  }

  if (cleanId === "328" && A != null && B != null) {
    const spd = ((A << 8) | B) / 2;
    return {
      idHex: "328",
      title: "Скорость автомобиля (0x328)",
      summary: `${spd.toFixed(1)} км/ч`,
      values: [{ label: "Скорость", value: `${spd.toFixed(1)} км/ч` }],
    };
  }

  return null;
}

export interface CanFrameDiffEntry {
  idHex: string;
  dlc: number;
  beforeHex: string;
  afterHex: string;
  changedByteIndices: number[];
  decodedHint: string | null;
}

/**
 * Compare two passive CAN bus snapshots (`Baseline` vs `Action`) to isolate which CAN ID and bytes changed
 * when the user pressed a button, moved the selector lever, or turned the steering wheel.
 */
export function diffCanBusSnapshots(
  baseline: { id: string; dlc: number; data: number[] }[],
  action: { id: string; dlc: number; data: number[] }[],
): CanFrameDiffEntry[] {
  const baseMap = new Map<string, { dlc: number; data: number[] }>();
  for (const row of baseline) {
    baseMap.set(row.id.toUpperCase(), { dlc: row.dlc, data: [...row.data] });
  }

  const out: CanFrameDiffEntry[] = [];
  for (const after of action) {
    const key = after.id.toUpperCase();
    const prev = baseMap.get(key);
    const afterHex = after.data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    if (!prev) {
      const decoded = decodeCanBroadcastFrame(key, after.data);
      out.push({
        idHex: key,
        dlc: after.dlc,
        beforeHex: "(новый ID)",
        afterHex,
        changedByteIndices: after.data.map((_, idx) => idx),
        decodedHint: decoded?.summary ?? null,
      });
      continue;
    }
    const changedByteIndices: number[] = [];
    const maxLen = Math.max(prev.data.length, after.data.length);
    for (let i = 0; i < maxLen; i++) {
      if (prev.data[i] !== after.data[i]) {
        changedByteIndices.push(i);
      }
    }
    if (changedByteIndices.length > 0) {
      const beforeHex = prev.data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      const decoded = decodeCanBroadcastFrame(key, after.data);
      out.push({
        idHex: key,
        dlc: after.dlc,
        beforeHex,
        afterHex,
        changedByteIndices,
        decodedHint: decoded?.summary ?? null,
      });
    }
  }
  return out;
}

function summarizeVerifiedPayload(verifyCmd: string, dataAfterLid: number[]): string | null {
  if (verifyCmd === "210E" && dataAfterLid.length >= 30) {
    const deg =
      ((dataAfterLid[26]! << 24) >>> 0) +
      (dataAfterLid[27]! << 16) +
      (dataAfterLid[28]! << 8) +
      dataAfterLid[29]!;
    return `Уровень деградации масла CVT (21 0E): ${deg}`;
  }
  if (verifyCmd === "210D" && dataAfterLid.length >= 4) {
    const deg =
      ((dataAfterLid[0]! << 24) >>> 0) +
      (dataAfterLid[1]! << 16) +
      (dataAfterLid[2]! << 8) +
      dataAfterLid[3]!;
    return `Уровень деградации масла CVT (21 0D): ${deg}`;
  }
  if (verifyCmd === "21BC") {
    const rem = decodeMitsubishiServiceReminder21BC(dataAfterLid);
    if (rem) return `Остаток до ТО (21 BC): ${rem.distanceRemaining} км / ${rem.monthsRemaining} мес.`;
  }
  if (verifyCmd === "2102" && dataAfterLid.length >= 2) {
    const wordBe = (dataAfterLid[0]! << 8) | dataAfterLid[1]!;
    const signedBe = wordBe >= 0x8000 ? wordBe - 0x10000 : wordBe;
    return `Угол руля (21 02): ${(signedBe * 0.1).toFixed(1)}°`;
  }
  return null;
}

/**
 * Executes a vehicle-bound Mitsubishi MUT-III SE service procedure (`fid` in `DiagCommon.exdf` / `Ecu/*.exdf`)
 * after strictly verifying that `skey` and `txCanId -> rxCanId` belong to the diagnosed vehicle's ECU.
 */
export async function executeMitsubishiServiceProcedure(
  elm: Elm327Client,
  options: {
    procedureId: string;
    skey: string;
    txCanId: string;
    rxCanId: string;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<MitsubishiServiceExecutionResult> {
  const proc = assertMitsubishiProcedureForEcu(options);
  const tx = Number.parseInt(proc.txCanId, 16);
  const rx = Number.parseInt(proc.rxCanId, 16);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const steps: string[] = [];
  let beforeHex: string | null = null;
  let afterHex: string | null = null;
  let decodedSummary: string | null = null;

  await openMitsubishiKwpSession(elm, tx, rx, proc.sessionHex);
  steps.push(`${proc.txCanId}→${proc.rxCanId}: Открыта диагностическая сессия (${proc.sessionHex}) [SKEY ${options.skey}]`);

  try {
    if (proc.verifyReadRequest && proc.verifyReadRequest.startsWith("21")) {
      const lid = Number.parseInt(proc.verifyReadRequest.slice(2), 16);
      try {
        const rawBefore = await elm.sendPayload(proc.verifyReadRequest, 2_000);
        const dataBefore = extractKwp21Data(rawBefore, lid);
        if (dataBefore && dataBefore.length > 0) {
          beforeHex = dataBefore.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          const beforeSummary = summarizeVerifiedPayload(proc.verifyReadRequest, dataBefore);
          steps.push(
            `До выполнения (${proc.verifyReadRequest}): ${beforeSummary ?? beforeHex}`,
          );
        }
      } catch {
        /* optional pre-read */
      }
    }

    const reqSid = Number.parseInt(proc.startRequest.slice(0, 2), 16);
    const rawStart = await elm.sendPayload(proc.startRequest, 3_000);
    const parsedStart = parseUdsResponse(rawStart, reqSid);
    const cleanRaw = rawStart.replace(/>/g, "").replace(/\s+/g, " ").trim();
    steps.push(`Запрос ${proc.startRequest} → ${cleanRaw}`);

    if (parsedStart.kind !== "positive") {
      const reason =
        parsedStart.kind === "negative"
          ? `${parsedStart.nrcText ?? "отказ ЭБУ"} (NRC 0x${(parsedStart.nrc ?? 0).toString(16).toUpperCase()})`
          : "нет положительного ответа от ЭБУ";
      throw new Error(`Блок ${proc.txCanId}→${proc.rxCanId} отклонил команду ${proc.startRequest}: ${reason}`);
    }

    if (proc.kind === "injector_read" && proc.startRequest === "21BF") {
      const dataBf = extractKwp21Data(rawStart, 0xbf) ?? parsedStart.payload.slice(1);
      const codes = decodeMitsubishiDieselInjectorIds21BF(dataBf);
      decodedSummary =
        codes.length > 0
          ? codes.map((code, idx) => `Цил. ${idx + 1}: ${code}`).join(" · ")
          : "Коды форсунок прочитаны";
      steps.push(`Коды форсунок (21 BF): ${decodedSummary}`);
    }

    if (proc.pollRequest) {
      await sleep(400);
      try {
        const rawPoll = await elm.sendPayload(proc.pollRequest, 2_000);
        steps.push(`Статус (${proc.pollRequest}) → ${rawPoll.replace(/>/g, "").replace(/\s+/g, " ").trim()}`);
      } catch {
        /* poll optional */
      }
    }

    if (proc.stopRequest) {
      await sleep(proc.holdMs ?? 3_000);
      try {
        const rawStop = await elm.sendPayload(proc.stopRequest, 2_000);
        steps.push(`Завершение (${proc.stopRequest}) → ${rawStop.replace(/>/g, "").replace(/\s+/g, " ").trim()}`);
      } catch {
        /* stop optional */
      }
    }

    if (proc.verifyReadRequest && proc.verifyReadRequest.startsWith("21")) {
      const lid = Number.parseInt(proc.verifyReadRequest.slice(2), 16);
      try {
        const rawAfter = await elm.sendPayload(proc.verifyReadRequest, 2_000);
        const dataAfter = extractKwp21Data(rawAfter, lid);
        if (dataAfter && dataAfter.length > 0) {
          afterHex = dataAfter.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          const afterSummary = summarizeVerifiedPayload(proc.verifyReadRequest, dataAfter);
          if (afterSummary) decodedSummary = afterSummary;
          steps.push(
            `После выполнения (${proc.verifyReadRequest}): ${afterSummary ?? afterHex}`,
          );
        }
      } catch {
        /* optional post-read */
      }
    }

    return {
      procedureId: proc.id,
      nameRu: proc.nameRu,
      skey: options.skey,
      txHex: proc.txCanId,
      rxHex: proc.rxCanId,
      success: true,
      steps,
      beforeHex,
      afterHex,
      decodedSummary,
    };
  } finally {
    await closeMitsubishiKwpSession(elm);
    steps.push(`${proc.txCanId}→${proc.rxCanId}: Сессия закрыта (10 81)`);
  }
}

