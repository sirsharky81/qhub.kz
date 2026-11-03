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

/**
 * 2022–2026 Outback / Legacy SGP answers CVTF on TCM 7A3 DID 10D2 (A−50).
 * 7E1 1017 is the older Lineartronic address. 7A2 103D and OBD 015C are not CVTF.
 */
const CVT_SOURCES: { tx: number; rx: number; did: string; title: string }[] = [
  { tx: 0x7a3, rx: 0x7ab, did: "10D2", title: "TCM 7A3 · DID 10D2" },
  { tx: 0x7a3, rx: 0x7ab, did: "1017", title: "TCM 7A3 · DID 1017" },
  { tx: 0x7e1, rx: 0x7e9, did: "1017", title: "TCM 7E1 · DID 1017" },
  { tx: 0x7e1, rx: 0x7e9, did: "10D2", title: "TCM 7E1 · DID 10D2" },
];

function dataHex(data: number[]): string {
  return data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

async function openCvtChannel(elm: Elm327Client, tx: number, rx: number): Promise<void> {
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* clones ignore a subset of these */
  }
  await elm.setCanHeader(tx, rx);
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* flow control is optional on a one-byte DID */
  }
}

async function readUdsDid(
  elm: Elm327Client,
  tx: number,
  rx: number,
  did: string,
): Promise<{ data: number[] | null; note: string }> {
  const label = `${tx.toString(16).toUpperCase()} ${did}`;
  try {
    await openCvtChannel(elm, tx, rx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "нет связи";
    return { data: null, note: `${label}: ${message}` };
  }
  const notes: string[] = [];
  for (const session of [null, "1003"] as const) {
    if (session) {
      try {
        await elm.sendPayload(session, 800);
      } catch {
        notes.push(`${label}: сессия 10 03 без ответа`);
        continue;
      }
    }
    try {
      const raw = await elm.sendPayload(`22${did}`, 2_500);
      const parsed = parseUdsResponse(raw, 0x22);
      if (parsed.kind === "positive" && parsed.payload.length >= 3) {
        return { data: parsed.payload.slice(2), note: "" };
      }
      notes.push(
        parsed.kind === "negative" ? `${label}: ${parsed.nrcText}` : `${label}: пустой ответ`,
      );
    } catch {
      notes.push(`${label}: нет ответа`);
    }
  }
  return { data: null, note: notes.join("; ") };
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
  const read = await readUdsDid(elm, 0x7e1, 0x7e9, "101B");
  if (!read.data || read.data.length < 2) return null;
  const mv = (read.data[0]! << 8) | read.data[1]!;
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
  const failures: string[] = [];

  for (const src of CVT_SOURCES) {
    const read = await readUdsDid(elm, src.tx, src.rx, src.did);
    if (!read.data) {
      if (read.note) failures.push(read.note);
      continue;
    }
    const temp = decodeSubaruCvtTempBytes(read.data);
    if (!temp) {
      failures.push(`${src.title}: байт ${dataHex(read.data)} вне шкалы A−50`);
      continue;
    }
    const tcmVolts = await readTcmVolts(elm);
    return {
      tempC: temp.celsius,
      source: src.title,
      method: `UDS 22 ${src.did} · ${src.title.split(" · ")[0]} · A−50`,
      rawHex: dataHex(read.data),
      decoded: formatSubaruTempText(temp),
      formula: temp.formula,
      tcmVolts,
      coolantHintC,
      noteRu: null,
    };
  }

  const detail = failures.filter(Boolean).slice(0, 4).join("; ");
  throw new Error(
    `TCM не ответил по CVTF (7A3/7E1 · UDS 22 10D2 / 1017). Зажигание ON, селектор P.${detail ? ` ${detail}` : ""}`,
  );
}
