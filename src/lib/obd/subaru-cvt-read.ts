import type { Elm327Client } from "./elm327";
import { parseMode01Pid } from "./obd2";
import {
  closeMitsubishiKwpSession,
  openMitsubishiKwpSession,
} from "./mitsubishi-modules";
import {
  decodeSubaruTemperatureBytes,
  formatSubaruTempText,
  type SubaruTempReading,
} from "./subaru-decode";
import { parseUdsResponse } from "./uds";

export interface SubaruCvtFluidReading {
  tempC: number;
  source: string;
  method: string;
  rawHex: string;
  decoded: string;
  formula: SubaruTempReading["formula"];
  tcmVolts: string | null;
  coolantHintC: number | null;
  noteRu: string | null;
}

function dataHex(data: number[]): string {
  return data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function decode103d(data: number[], ecuTx: "7E1" | "7A2"): SubaruTempReading | null {
  return decodeSubaruTemperatureBytes(data, { ecuTx });
}

async function readUds103d(
  elm: Elm327Client,
  tx: "7E1" | "7A2",
  rx: "7E9" | "7AA",
  sessionHex: string,
): Promise<{ data: number[]; raw: string } | null> {
  const txId = tx === "7E1" ? 0x7e1 : 0x7a2;
  const rxId = rx === "7E9" ? 0x7e9 : 0x7aa;
  const opened = await openMitsubishiKwpSession(elm, txId, rxId, sessionHex);
  if (!opened && sessionHex !== "1003") return null;
  try {
    const raw = await elm.sendPayload("22103D", 2_500);
    const parsed = parseUdsResponse(raw, 0x22);
    if (parsed.kind !== "positive" || parsed.payload.length < 3) return null;
    return { data: parsed.payload.slice(2), raw };
  } catch {
    return null;
  } finally {
    await closeMitsubishiKwpSession(elm);
  }
}

async function readObd015c(elm: Elm327Client, tx: number, rx: number): Promise<number | null> {
  try {
    await elm.setCanHeader(tx, rx);
    const raw = await elm.obdMode("015C", 2_500);
    const bytes = parseMode01Pid(raw, 0x5c);
    if (!bytes || bytes.length < 1) return null;
    const temp = bytes[0]! - 40;
    if (temp < -35 || temp > 110) return null;
    return temp;
  } catch {
    return null;
  }
}

async function readCoolantC(elm: Elm327Client): Promise<number | null> {
  try {
    await elm.setCanHeader(0x7e0, 0x7e8);
    const raw = await elm.obdMode("0105", 2_000);
    const bytes = parseMode01Pid(raw, 0x05);
    if (!bytes || bytes.length < 1) return null;
    const temp = bytes[0]! - 40;
    if (temp < -35 || temp > 110) return null;
    return temp;
  } catch {
    return null;
  }
}

async function readTcmVolts(elm: Elm327Client): Promise<string | null> {
  const opened =
    (await openMitsubishiKwpSession(elm, 0x7e1, 0x7e9, "1003")) ||
    (await openMitsubishiKwpSession(elm, 0x7e1, 0x7e9, "1092"));
  if (!opened) return null;
  try {
    const raw = await elm.sendPayload("22101B", 2_000);
    const parsed = parseUdsResponse(raw, 0x22);
    if (parsed.kind !== "positive" || parsed.payload.length < 4) return null;
    const mv = (parsed.payload[2]! << 8) | parsed.payload[3]!;
    return `${(mv / 1000).toFixed(2)} В (${mv} мВ)`;
  } catch {
    return null;
  } finally {
    await closeMitsubishiKwpSession(elm);
  }
}

/**
 * Subaru Lineartronic CVTF temperature — prefer TCM 7E1 (UDS 103D / OBD 015C).
 * 7A2 DID 103D is a thermal loop hint only and is often not CVTF fluid temp.
 */
export async function readSubaruCvtFluidTemp(elm: Elm327Client): Promise<SubaruCvtFluidReading> {
  const coolantHintC = await readCoolantC(elm);

  for (const session of ["1092", "1003", "1089"] as const) {
    const res = await readUds103d(elm, "7E1", "7E9", session);
    if (!res) continue;
    const temp = decode103d(res.data, "7E1");
    if (!temp) continue;
    const tcmVolts = await readTcmVolts(elm);
    return {
      tempC: temp.celsius,
      source: "TCM / вариатор (7E1)",
      method: `UDS 22 103D · сессия ${session.replace(/(.{2})/, "$1 ")}`,
      rawHex: dataHex(res.data),
      decoded: formatSubaruTempText(temp),
      formula: temp.formula,
      tcmVolts,
      coolantHintC,
      noteRu: null,
    };
  }

  for (const [tx, rx, label] of [
    [0x7e1, 0x7e9, "7E1 · OBD-II"],
    [0x7e0, 0x7e8, "7E0 · OBD-II"],
  ] as const) {
    const tempC = await readObd015c(elm, tx, rx);
    if (tempC == null) continue;
    const tcmVolts = tx === 0x7e1 ? await readTcmVolts(elm) : null;
    return {
      tempC,
      source: label,
      method: "OBD-II Mode 01 PID 015C (ATF/CVTF)",
      rawHex: `${(tempC + 40).toString(16).padStart(2, "0").toUpperCase()} (A−40)`,
      decoded: `${tempC} °C`,
      formula: "a-40",
      tcmVolts,
      coolantHintC,
      noteRu: null,
    };
  }

  const ptm = await readUds103d(elm, "7A2", "7AA", "1003");
  if (ptm) {
    const temp = decode103d(ptm.data, "7A2");
    if (temp) {
      return {
        tempC: temp.celsius,
        source: "Силовая установка (7A2)",
        method: "UDS 22 103D (термоконтур, не TCM)",
        rawHex: dataHex(ptm.data),
        decoded: formatSubaruTempText(temp),
        formula: temp.formula,
        tcmVolts: null,
        coolantHintC,
        noteRu:
          "TCM 7E1 не ответил. Значение с 7A2 может не совпадать с температурой масла CVTF в поддоне — ориентируйтесь на TCM или PID 015C после прогрева.",
      };
    }
  }

  throw new Error(
    "TCM 7E1 не ответил (UDS 103D и OBD 015C). Проверьте зажигание ON, пробег 1–2 км для прогрева ATF и повторите опрос.",
  );
}
