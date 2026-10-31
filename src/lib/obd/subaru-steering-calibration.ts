import type { Elm327Client } from "./elm327";
import { extractHexTokens } from "./hex";
import type { SasCalibrationResult } from "./mitsubishi-modules";
import { parseUdsResponse } from "./uds";

const EPS_TX = 0x746;
const EPS_RX = 0x74e;
const VDC_TX = 0x7b0;
const VDC_RX = 0x7b8;

/** Decode EPS DID 1041 (2 data bytes, 0.1°/bit, signed). */
export function decodeSubaruEpsSteeringAngleDeg(data: number[]): number | null {
  if (data.length < 2) return null;
  const u16 = (data[0]! << 8) | data[1]!;
  const s16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
  return Number((s16 / 10).toFixed(1));
}

/**
 * Candidate RoutineControl (31 01) starts for «VDC Sensor Midpoint Setting» on SGP ABS/VDC (7B0).
 * Exact routine ID varies by ROM; we try known community captures in order and stop on first 71 xx.
 */
const VDC_MIDPOINT_ROUTINE_HEX = [
  "31010301",
  "31010201",
  "31010101",
  "31012001",
] as const;

async function openSubaruModuleSession(elm: Elm327Client, tx: number, rx: number): Promise<void> {
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }
  await elm.setCanHeader(tx, rx);
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* simple adapters */
  }
  await elm.sendPayload("1003", 2_000);
}

async function closeSubaruModuleSession(elm: Elm327Client): Promise<void> {
  try {
    await elm.sendPayload("1001", 1_000);
  } catch {
    /* ignore */
  }
}

async function readEpsSteeringAngleDeg(elm: Elm327Client): Promise<number | null> {
  await openSubaruModuleSession(elm, EPS_TX, EPS_RX);
  try {
    const raw = await elm.sendPayload("221041", 2_000);
    const parsed = parseUdsResponse(raw, 0x22);
    if (parsed.kind !== "positive" || parsed.payload.length < 4) return null;
    const body =
      parsed.payload[0] === 0x10 && parsed.payload[1] === 0x41
        ? parsed.payload.slice(2)
        : parsed.payload.slice(-2);
    return decodeSubaruEpsSteeringAngleDeg(body);
  } finally {
    await closeSubaruModuleSession(elm);
  }
}

function routineResponseOk(raw: string, requestHex: string): boolean {
  const parsed = parseUdsResponse(raw, 0x31);
  if (parsed.kind === "positive") return true;
  const tokens = extractHexTokens(raw);
  if (!tokens.includes(0x71)) return false;
  const req = requestHex.replace(/\s+/g, "").toUpperCase();
  if (req.startsWith("3101") && req.length >= 8) {
    const rid = req.slice(4, 8);
    const b0 = Number.parseInt(rid.slice(0, 2), 16);
    const b1 = Number.parseInt(rid.slice(2, 4), 16);
    const idx = tokens.indexOf(0x71);
    if (idx >= 0 && tokens[idx + 1] === 0x01 && tokens[idx + 2] === b0 && tokens[idx + 3] === b1) {
      return true;
    }
  }
  return tokens.includes(0x71);
}

/**
 * Subaru steering-angle zero / VDC sensor midpoint (SSM: «VDC sensor midpoint setting mode»).
 * Writes on ABS/VDC 7B0 → 7B8; live angle verification on EPS 746 DID 1041.
 */
export async function calibrateSubaruSteeringZero(elm: Elm327Client): Promise<SasCalibrationResult> {
  const steps: string[] = [];
  const beforeDeg = await readEpsSteeringAngleDeg(elm);
  steps.push(
    beforeDeg != null
      ? `746→74E: Угол до калибровки (22 1041) ≈ ${beforeDeg > 0 ? "+" : ""}${beforeDeg.toFixed(1)}°`
      : "746→74E: Угол до калибровки не считан (проверьте IG ON и связь с EPS)",
  );

  await openSubaruModuleSession(elm, VDC_TX, VDC_RX);
  steps.push("7B0→7B8: Расширенная сессия (10 03) для ABS/VDC");

  let routineOk = false;
  let lastRaw = "";
  try {
    for (const routineHex of VDC_MIDPOINT_ROUTINE_HEX) {
      const label = routineHex.replace(/(.{2})/g, "$1 ").trim();
      try {
        const raw = await elm.sendPayload(routineHex, 8_000);
        lastRaw = raw.replace(/>/g, "").trim();
        steps.push(`7B0→7B8: RoutineControl ${label} → ${lastRaw || "нет ответа"}`);
        if (routineResponseOk(raw, routineHex)) {
          routineOk = true;
          break;
        }
      } catch (e) {
        steps.push(
          `7B0→7B8: RoutineControl ${label} → ошибка: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } finally {
    await closeSubaruModuleSession(elm);
    steps.push("7B0→7B8: Сессия закрыта (10 01)");
  }

  const afterDeg = await readEpsSteeringAngleDeg(elm);
  if (afterDeg != null) {
    steps.push(
      `746→74E: Угол после калибровки ≈ ${afterDeg > 0 ? "+" : ""}${afterDeg.toFixed(1)}°`,
    );
  }

  if (!routineOk) {
    steps.push(
      "Блок VDC не подтвердил RoutineControl (71). Возможны другая прошивка или нужен Subaru Select Monitor.",
    );
    return { success: false, steps, finalAngleDeg: afterDeg ?? beforeDeg };
  }

  return {
    success: true,
    steps,
    finalAngleDeg: afterDeg ?? beforeDeg ?? 0,
  };
}
