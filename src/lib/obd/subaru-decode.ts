/**
 * Subaru live-data scaling used by QHub (SGP UDS 0x22 and classic SSM).
 *
 * Coolant-style temperature: ISO 14229 `A − 40` for 1-byte DIDs (and `00`-padded
 * 2-byte payloads). Lineartronic CVTF uses `A − 50` on TCM 7E1/7A3.
 *
 * TPMS on BIU 752: North-American sensors often send 0.2 PSI/count; European /
 * CIS cars often send kilopascals. 16-bit DID payloads are kPa or 0.1 kPa.
 */

export interface SubaruTempReading {
  celsius: number;
  formula: "a-40" | "a-50" | "u16/10" | "u16/10-40";
}

export interface SubaruTpmsReading {
  kpa: number;
  bar: number;
  psi: number;
  temperatureC: number | null;
  formula: "kpa" | "kpa-0.1" | "psi-0.2";
}

const KPA_PER_PSI_TICK = 1.379;
const PSI_PER_KPA = 0.145038;

function looksLikeTempByte(value: number): boolean {
  const as40 = value - 40;
  const as50 = value - 50;
  return (as40 >= -30 && as40 <= 95) || (as50 >= -30 && as50 <= 95);
}

function isPlausibleSensorTempC(celsius: number): boolean {
  return celsius >= -40 && celsius <= 180;
}

function tempFromByte(value: number): number {
  const as40 = value - 40;
  const as50 = value - 50;
  if (as40 >= -20 && as40 <= 90) return as40;
  if (as50 >= -20 && as50 <= 90) return as50;
  return as40;
}

function packPressure(kpa: number, formula: SubaruTpmsReading["formula"], temperatureC: number | null): SubaruTpmsReading {
  const roundedKpa = Number(kpa.toFixed(1));
  return {
    kpa: roundedKpa,
    bar: Number((roundedKpa / 100).toFixed(2)),
    psi: Number((roundedKpa * PSI_PER_KPA).toFixed(1)),
    temperatureC,
    formula,
  };
}

/**
 * ISO/SAE coolant-style temperature: one data byte, °C = A − 40.
 * Two-byte payloads with a leading 0x00 are treated as padded 1-byte values.
 */
export function decodeSubaruTemperatureBytes(
  dataBytes: number[],
  _opts?: { ecuTx?: string },
): SubaruTempReading | null {
  if (dataBytes.length === 0) return null;
  if (dataBytes.length >= 2 && dataBytes[0] !== 0) return null;
  const raw = dataBytes.length >= 2 ? dataBytes[1]! : dataBytes[0]!;
  const celsius = raw - 40;
  if (!isPlausibleSensorTempC(celsius)) return null;
  return { celsius, formula: "a-40" };
}

/**
 * Lineartronic CVTF / ATF: ScanGauge, Torque and Pelican use A − 50
 * on TCM 7E1 DID 1017 and SGP TCM 7A3 DID 1017 / 10D2.
 */
export function decodeSubaruCvtTempBytes(dataBytes: number[]): SubaruTempReading | null {
  if (dataBytes.length === 0) return null;
  const raw = dataBytes.length >= 2 && dataBytes[0] === 0 ? dataBytes[1]! : dataBytes[0]!;
  const celsius = raw - 50;
  if (!isPlausibleSensorTempC(celsius)) return null;
  return { celsius, formula: "a-50" };
}

/**
 * Decode one wheel of Subaru BIU TPMS (DID 1021–1024 payload after DID echo).
 */
export function decodeSubaruTpmsBytes(dataBytes: number[]): SubaruTpmsReading | null {
  if (dataBytes.length === 0) return null;
  const first = dataBytes[0]!;
  if (first === 0xff && (dataBytes[1] == null || dataBytes[1] === 0xff)) return null;

  if (dataBytes.length >= 2) {
    const hi = dataBytes[0]!;
    const lo = dataBytes[1]!;
    const u16 = (hi << 8) | lo;
    const extraTemp =
      dataBytes[2] != null && looksLikeTempByte(dataBytes[2]) ? tempFromByte(dataBytes[2]) : null;

    if (u16 >= 800 && u16 <= 5000) {
      return packPressure(u16 / 10, "kpa-0.1", extraTemp);
    }

    if (hi === 0 && lo > 0 && lo !== 0xff) {
      const one = decodeOneBytePressure(lo);
      return packPressure(one.kpa, one.formula, extraTemp);
    }

    if (u16 >= 80 && u16 <= 450 && hi > 0) {
      return packPressure(u16, "kpa", extraTemp);
    }

    if (lo !== 0xff && looksLikeTempByte(lo)) {
      const one = decodeOneBytePressure(hi);
      return packPressure(one.kpa, one.formula, tempFromByte(lo));
    }
  }

  if (first === 0) return null;
  const one = decodeOneBytePressure(first);
  const tempByte = dataBytes[1];
  const temperatureC = tempByte != null && tempByte !== 0xff && looksLikeTempByte(tempByte) ? tempFromByte(tempByte) : null;
  return packPressure(one.kpa, one.formula, temperatureC);
}

function decodeOneBytePressure(raw: number): { kpa: number; formula: SubaruTpmsReading["formula"] } {
  // 200–280 raw is already kPa (2.0–2.8 bar). Applying 0.2 PSI/count would show ~3.0–3.9 bar.
  if (raw >= 200 && raw <= 280) {
    return { kpa: raw, formula: "kpa" };
  }
  return { kpa: raw * KPA_PER_PSI_TICK, formula: "psi-0.2" };
}

export function formatSubaruTempText(reading: SubaruTempReading): string {
  const rounded = Number.isInteger(reading.celsius) ? String(reading.celsius) : reading.celsius.toFixed(1);
  return `${rounded} °C`;
}

export function formatSubaruTpmsText(reading: SubaruTpmsReading): string {
  const temp = reading.temperatureC != null ? ` · ${reading.temperatureC} °C` : "";
  return `${reading.bar.toFixed(2)} бар (${Math.round(reading.kpa)} кПа / ${reading.psi} PSI)${temp}`;
}

export function cvtTempBand(tempC: number): {
  id: "cold" | "level" | "warm" | "learn" | "hot";
  labelRu: string;
} {
  if (tempC < 35) return { id: "cold", labelRu: "Холодная — уровень CVTF ещё рано проверять" };
  if (tempC <= 45) return { id: "level", labelRu: "Окно уровня CVTF (35–45 °C)" };
  if (tempC < 65) return { id: "warm", labelRu: "Прогрев — до окна адаптации ещё рано" };
  if (tempC <= 85) return { id: "learn", labelRu: "Окно адаптации вариатора (65–85 °C)" };
  return { id: "hot", labelRu: "Выше рабочего окна обучения" };
}
