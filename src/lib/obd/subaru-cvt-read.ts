import type { Elm327Client } from "./elm327";
import { parseMode01Pid } from "./obd2";
import {
  decodeSubaruCvtTempBytes,
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

/** Documented Lineartronic / SGP CVTF sources (A − 50). */
const CVT_SOURCES: { tx: number; rx: number; did: string; title: string }[] = [
  { tx: 0x7e1, rx: 0x7e9, did: "1017", title: "TCM 7E1 · DID 1017" },
  { tx: 0x7a3, rx: 0x7ab, did: "1017", title: "TCM 7A3 · DID 1017" },
  { tx: 0x7a3, rx: 0x7ab, did: "10D2", title: "TCM 7A3 · DID 10D2" },
  { tx: 0x7e1, rx: 0x7e9, did: "10D2", title: "TCM 7E1 · DID 10D2" },
];

function dataHex(data: number[]): string {
  return data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function standardRx(tx: number, rx: number): boolean {
  return rx === ((tx + 8) & 0x7ff);
}

async function readUdsDid(
  elm: Elm327Client,
  tx: number,
  rx: number,
  did: string,
): Promise<number[] | null> {
  try {
    if (standardRx(tx, rx)) await elm.clearRxFilter();
    await elm.setCanHeader(tx, standardRx(tx, rx) ? undefined : rx);
  } catch {
    await elm.setCanHeader(tx, rx);
  }
  try {
    await elm.sendPayload("1003", 800);
  } catch {
    /* default session may already answer 22 */
  }
  try {
    const raw = await elm.sendPayload(`22${did}`, 2_500);
    const parsed = parseUdsResponse(raw, 0x22);
    if (parsed.kind !== "positive" || parsed.payload.length < 3) return null;
    return parsed.payload.slice(2);
  } catch {
    return null;
  } finally {
    try {
      await elm.sendPayload("1001", 600);
    } catch {
      /* ignore */
    }
  }
}

async function readCoolantC(elm: Elm327Client): Promise<number | null> {
  try {
    await elm.setCanHeader(0x7e0, 0x7e8);
    const raw = await elm.obdMode("0105", 2_000);
    const bytes = parseMode01Pid(raw, 0x05);
    if (!bytes || bytes.length < 1) return null;
    const temp = bytes[0]! - 40;
    if (temp < -40 || temp > 180) return null;
    return temp;
  } catch {
    return null;
  }
}

async function readTcmVolts(elm: Elm327Client): Promise<string | null> {
  const data = await readUdsDid(elm, 0x7e1, 0x7e9, "101B");
  if (!data || data.length < 2) return null;
  const mv = (data[0]! << 8) | data[1]!;
  if (mv < 5000 || mv > 18000) return null;
  return `${(mv / 1000).toFixed(2)} В (${mv} мВ)`;
}

/**
 * Subaru Lineartronic CVTF temperature.
 * Uses UDS 22 1017 / 10D2 on TCM 7E1 and SGP TCM 7A3, scale A − 50.
 * Does not use 7A2 DID 103D (not CVTF) or OBD PID 015C (engine oil).
 */
export async function readSubaruCvtFluidTemp(elm: Elm327Client): Promise<SubaruCvtFluidReading> {
  const coolantHintC = await readCoolantC(elm);

  for (const src of CVT_SOURCES) {
    const data = await readUdsDid(elm, src.tx, src.rx, src.did);
    if (!data) continue;
    const temp = decodeSubaruCvtTempBytes(data);
    if (!temp) continue;
    const tcmVolts = await readTcmVolts(elm);
    return {
      tempC: temp.celsius,
      source: src.title,
      method: `UDS 22 ${src.did} · ${src.title.split(" · ")[0]} · A−50`,
      rawHex: dataHex(data),
      decoded: formatSubaruTempText(temp),
      formula: temp.formula,
      tcmVolts,
      coolantHintC,
      noteRu: null,
    };
  }

  throw new Error(
    "TCM не ответил по CVTF (7E1/7A3 · UDS 22 1017 / 10D2). Зажигание ON, селектор P; на SGP часто отвечает блок 7A3.",
  );
}
