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

/**
 * Formats a UDS/OBD positive payload into a user-friendly string without exposing
 * internal CAN addresses, DID numbers, or PID numbers.
 */
export function formatSubaruUserValue(
  payload: number[],
  requestSid: number,
  txHex: string,
): string {
  const cleanTx = txHex.trim().toUpperCase();
  if (requestSid === 0x31) return "Процедура подтверждена";
  if (requestSid === 0x2f) return "Команда приводу подтверждена";
  if (requestSid === 0x14 || requestSid === 0x04) return "Память ошибок очищена";

  if (requestSid === 0x09 && payload.length >= 2) {
    const pid = payload[0]!;
    if (pid === 0x02) {
      const ascii = payload
        .slice(2)
        .map((b) => (b >= 0x30 && b <= 0x5a ? String.fromCharCode(b) : ""))
        .join("")
        .trim();
      return ascii || "Получено";
    }
    if (pid === 0x04) {
      const parts = payload
        .slice(2)
        .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "\0"))
        .join("")
        .split(/\0+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
      return parts.length > 0 ? parts.join(" · ") : "Получено";
    }
    if (pid === 0x06) {
      const cvnBytes = payload.slice(2);
      const chunks: string[] = [];
      for (let i = 0; i + 3 < cvnBytes.length; i += 4) {
        chunks.push(
          cvnBytes
            .slice(i, i + 4)
            .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
            .join(""),
        );
      }
      return chunks.length > 0 ? chunks.join(" · ") : "Получено";
    }
  }

  if (requestSid === 0x01 && payload.length >= 2) {
    const pid = payload[0]!;
    const data = payload.slice(1);
    if (pid === 0x05 && data.length >= 1) return `${data[0]! - 40} °C`;
    if (pid === 0x0c && data.length >= 2) {
      return `${Math.round(((data[0]! << 8) | data[1]!) / 4)} об/мин`;
    }
    if (pid === 0x23 && data.length >= 2) {
      return `${((data[0]! << 8) | data[1]!) * 10} кПа`;
    }
    if (pid === 0x42 && data.length >= 2) {
      return `${(((data[0]! << 8) | data[1]!) / 1000).toFixed(2)} В`;
    }
  }

  if (requestSid === 0x22 && payload.length >= 3) {
    const didHex = payload
      .slice(0, 2)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    const dataBytes = payload.slice(2);

    if (didHex === "101E" && dataBytes.length === 6) {
      const w0 = (dataBytes[0]! << 8) | dataBytes[1]!;
      const ticks = (dataBytes[4]! << 8) | dataBytes[5]!;
      return `Запусков: ${w0} · таймер зажигания: ${(ticks / 10).toFixed(1)} с`;
    }
    if ((didHex === "101B" || didHex === "1019") && dataBytes.length === 2) {
      const mv = (dataBytes[0]! << 8) | dataBytes[1]!;
      return `${(mv / 1000).toFixed(2)} В`;
    }
    if (cleanTx === "746" && didHex === "1041" && dataBytes.length === 2) {
      const u16 = (dataBytes[0]! << 8) | dataBytes[1]!;
      const s16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
      const deg = (s16 / 10).toFixed(1);
      return s16 === 0 ? "ровно 0.0°" : s16 < 0 ? `${deg}° (вправо)` : `+${deg}° (влево)`;
    }
    if (cleanTx === "752" && ["1021", "1022", "1023", "1024"].includes(didHex)) {
      const tpms = decodeSubaruTpmsBytes(dataBytes);
      if (tpms) return formatSubaruTpmsText(tpms);
    }
    if ((cleanTx === "7E1" || cleanTx === "7A3") && (didHex === "1017" || didHex === "10D2")) {
      const cvt = decodeSubaruCvtTempBytes(dataBytes);
      if (cvt) return formatSubaruTempText(cvt);
    }
    if ((cleanTx === "7E1" || cleanTx === "7A3") && dataBytes.length >= 1) {
      if (["10C8", "10C9", "126D", "1142", "1143"].includes(didHex)) {
        return `${((dataBytes[0]! * 100) / 255).toFixed(1)}%`;
      }
      if (didHex === "1472") {
        return `${dataBytes[0]!}%`;
      }
      if (didHex === "1471") {
        const temp = decodeSubaruTemperatureBytes(dataBytes);
        if (temp) return formatSubaruTempText(temp);
      }
      if (dataBytes.length >= 2 && ["10CB", "1146", "1138", "12E4"].includes(didHex)) {
        return `${(dataBytes[0]! << 8) | dataBytes[1]!} об/мин`;
      }
      if (dataBytes.length >= 2 && ["1144", "1145", "113B", "113C", "12B2", "12B3", "12B4", "12B5"].includes(didHex)) {
        return `${(dataBytes[0]! << 8) | dataBytes[1]!} мА`;
      }
    }
    if (cleanTx === "7A2" && ["1297", "1298", "10CB", "10CC"].includes(didHex)) {
      const temp = decodeSubaruTemperatureBytes(dataBytes);
      if (temp) return formatSubaruTempText(temp);
    }
    if (cleanTx === "7C4" && ["1221", "123D", "12AE"].includes(didHex)) {
      const temp = decodeSubaruTemperatureBytes(dataBytes);
      if (temp) return formatSubaruTempText(temp);
    }
    if (cleanTx === "783" && (didHex === "1041" || didHex === "1042") && dataBytes.length === 1) {
      return `${Math.round((dataBytes[0]! * 100) / 255)}%`;
    }

    const ascii = dataBytes
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (ascii.length >= 3 && /[A-Za-z0-9]{3}/.test(ascii)) {
      return ascii;
    }

    if (dataBytes.length === 1) {
      return `${dataBytes[0]!}`;
    }
    if (dataBytes.length === 2) {
      return `${(dataBytes[0]! << 8) | dataBytes[1]!}`;
    }
    return dataBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  const printable = payload
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (printable.length >= 4 && /[A-Za-z0-9]{3}/.test(printable)) return printable;
  return "Получено";
}
