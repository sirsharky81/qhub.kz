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

export type SubaruServiceActionId =
  | "vdc-steering-zero"
  | "ecm-Clear-learned"
  | "tcm-at-learning-clear"
  | "tcm-at-learning-start"
  | "epb-pad-release"
  | "epb-pad-return"
  | "epb-stroke-cal"
  | "iss-battery-reset"
  | "ac-flap-init"
  | "srh-headlight-zero";

export interface SubaruServiceActionSpec {
  id: SubaruServiceActionId;
  utilityId: string;
  titleRu: string;
  buttonLabelRu: string;
  txHex: string;
  rxHex: string;
  serviceBadge: string;
  warningRu: string;
  candidatePayloads: readonly string[];
}

export const SUBARU_SERVICE_ACTIONS: readonly SubaruServiceActionSpec[] = [
  {
    id: "vdc-steering-zero",
    utilityId: "util-eps-sas-zero",
    titleRu: "Калибровка нуля датчика угла руля и G-сенсора (VDC Sensor Midpoint Setting Mode)",
    buttonLabelRu: "Калибровать нуль руля и G-сенсора (VDC 7B0)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Автомобиль должен стоять на ровной горизонтальной площадке, колёса и руль выставлены строго прямо (около 0.0°), ручник затянут.",
    candidatePayloads: ["31010301", "31010201", "31010101", "31012001"],
  },
  {
    id: "ecm-Clear-learned",
    utilityId: "util-ecm-ewg-roughness",
    titleRu: "Сброс адаптаций ЭБУ двигателя (Clear Memory 2 — топливные коррекции, дроссель ETCS, IAM/детонация, фазы AVCS)",
    buttonLabelRu: "Сбросить адаптации ДВС и дросселя (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 / SSM B8",
    warningRu:
      "Двигатель должен быть заглушен, зажигание включено (IG ON), педаль газа отпущена. После сброса выключите зажигание на 10 с, затем включите IG ON на 15 с для самообучения заслонки ETCS перед запуском.",
    candidatePayloads: ["31010101", "31010201", "31010F01", "14FFFFFF", "04"],
  },
  {
    id: "tcm-at-learning-clear",
    utilityId: "util-cvt-at-inspection",
    titleRu: "Сброс таблиц адаптации вариатора Lineartronic (AT Learning Memory Clear / Clear Memory 2)",
    buttonLabelRu: "Сбросить адаптации вариатора (AT Learning Clear)",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Выполняйте сброс AT Learning только если после него вы готовы провести цикл обучения муфты переднего хода и гидроблока при температуре CVTF 65–85 °C. Рычаг в P, стояночный тормоз включён, IG ON (двигатель заглушен).",
    candidatePayloads: ["31010101", "31010201", "31010301", "14FFFFFF"],
  },
  {
    id: "tcm-at-learning-start",
    utilityId: "util-cvt-at-inspection",
    titleRu: "Запуск режима обучения вариатора Lineartronic (AT Learning Mode — Simple / Full)",
    buttonLabelRu: "Запустить адаптацию вариатора (AT Learning Mode)",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Температура CVTF должна быть в окне 65–85 °C, автомобиль неподвижен, педаль тормоза нажата до упора, руль прямо, кондиционер и фары выключены.",
    candidatePayloads: ["31010202", "31010102", "31010302", "31011001"],
  },
  {
    id: "epb-pad-release",
    utilityId: "util-epb-brake-service",
    titleRu: "Сервисный режим замены задних колодок: РАЗВЕДЕНИЕ электроручника EPB (Pad Exchange Release)",
    buttonLabelRu: "Развести колодки EPB (Сервисный режим)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01 / 2F",
    warningRu:
      "Поставьте противооткатные упоры под передние колёса! Зажигание IG ON, селектор в P, педаль тормоза не нажата. Моторы суппортов полностью разведут поршни.",
    candidatePayloads: ["31010501", "31010401", "2F20120302", "3101201202"],
  },
  {
    id: "epb-pad-return",
    utilityId: "util-epb-brake-service",
    titleRu: "Выход из сервисного режима замены колодок: СВЕДЕНИЕ электроручника EPB (Pad Exchange Return)",
    buttonLabelRu: "Свести колодки EPB (Завершить замену)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01 / 2F",
    warningRu:
      "Убедитесь, что новые тормозные колодки и суппорты полностью установлены на место! Моторы EPB сведут колодки к дискам.",
    candidatePayloads: ["31010502", "31010402", "2F20120301", "3101201201"],
  },
  {
    id: "epb-stroke-cal",
    utilityId: "util-epb-brake-service",
    titleRu: "Калибровка хода и усилия затяжки электроручника EPB (EPB Clamp Force / Stroke Calibration)",
    buttonLabelRu: "Откалибровать ход и затяжку EPB",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Выполняется после сведения новых задних колодок. Автомобиль неподвижен на ровной поверхности, IG ON.",
    candidatePayloads: ["31010503", "31010403", "31010303", "3101200D"],
  },
  {
    id: "iss-battery-reset",
    utilityId: "util-tcm-eop-startstop",
    titleRu: "Сброс адаптации и счётчиков деградации АКБ Auto Start-Stop после замены аккумулятора (ISS-001..009)",
    buttonLabelRu: "Сбросить адаптацию АКБ Start-Stop",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Выполняется после установки нового аккумулятора EFB / AGM или полной зарядки АКБ. Зажигание IG ON, двигатель заглушен.",
    candidatePayloads: ["31011401", "31010401", "31010501", "31011003"],
  },
  {
    id: "ac-flap-init",
    utilityId: "util-ac-hvac-actuators",
    titleRu: "Калибровка крайних положений сервоприводов заслонок климат-контроля (Auto A/C Actuator Reset)",
    buttonLabelRu: "Калибровать заслонки климата (7C4)",
    txHex: "7C4",
    rxHex: "7CC",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Зажигание IG ON. Сервоприводы заслонок смешивания (Air Mix) и направления обдува (Mode) пройдут от упора до упора для записи крайних точек.",
    candidatePayloads: ["31010101", "31010201", "31011201"],
  },
  {
    id: "srh-headlight-zero",
    utilityId: "util-srh-adb-headlight",
    titleRu: "Инициализация нулевого уровня корректора и поворотных фар SRH / ADB (LCT-001..003)",
    buttonLabelRu: "Калибровать нуль фар SRH / ADB (74C)",
    txHex: "74C",
    rxHex: "754",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Автомобиль на ровной горизонтальной площадке без груза в багажнике, водитель за рулём, руль строго прямо (0.0°), зажигание IG ON.",
    candidatePayloads: ["31010101", "31010201", "31011035"],
  },
];

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

function actionPayloadResponseOk(raw: string, requestHex: string): boolean {
  const cleanReq = requestHex.replace(/\s+/g, "").toUpperCase();
  const sid = Number.parseInt(cleanReq.slice(0, 2), 16);
  if (sid === 0x31) {
    return routineResponseOk(raw, cleanReq);
  }
  const parsed = parseUdsResponse(raw, sid);
  return parsed.kind === "positive";
}

/**
 * Executes a Subaru calibration, adaptation, or reset routine from `SUBARU_SERVICE_ACTIONS`.
 */
export async function executeSubaruServiceAction(
  elm: Elm327Client,
  actionId: SubaruServiceActionId,
): Promise<SasCalibrationResult> {
  if (actionId === "vdc-steering-zero") {
    return calibrateSubaruSteeringZero(elm);
  }
  const spec = SUBARU_SERVICE_ACTIONS.find((a) => a.id === actionId);
  if (!spec) {
    return {
      success: false,
      steps: [`Неизвестный идентификатор процедуры: ${actionId}`],
      finalAngleDeg: null,
    };
  }

  const tx = Number.parseInt(spec.txHex, 16);
  const rx = Number.parseInt(spec.rxHex, 16);
  const steps: string[] = [];

  // Central Gateway (750 -> 758) wake/session check per SSM4 cgwCommConnect / cgwSidFilterRemove
  if (tx !== 0x750) {
    try {
      await openSubaruModuleSession(elm, 0x750, 0x758);
      steps.push("750→758 (CGW): Расширенная сессия шлюза открыта (10 03)");
    } catch {
      /* Gateway may not require explicit 10 03 */
    }
  }

  await openSubaruModuleSession(elm, tx, rx);
  steps.push(`${spec.txHex}→${spec.rxHex}: Открыта расширенная диагностическая сессия (10 03)`);

  let ok = false;
  try {
    for (const payloadHex of spec.candidatePayloads) {
      const label = payloadHex.replace(/(.{2})/g, "$1 ").trim();
      try {
        // Send TesterPresent (3E 00) before long RoutineControl per SSM4 AVCKeepAliveThreadP5
        try {
          await elm.sendPayload("3E00", 1_000);
        } catch {
          /* ignore */
        }
        const raw = await elm.sendPayload(payloadHex, 8_000);
        const cleanRaw = raw.replace(/>/g, "").trim();
        steps.push(`${spec.txHex}→${spec.rxHex}: Запрос ${label} → ${cleanRaw || "нет ответа"}`);
        if (actionPayloadResponseOk(raw, payloadHex)) {
          ok = true;
          break;
        }
      } catch (e) {
        steps.push(
          `${spec.txHex}→${spec.rxHex}: Запрос ${label} → ошибка: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } finally {
    await closeSubaruModuleSession(elm);
    steps.push(`${spec.txHex}→${spec.rxHex}: Сессия завершена (10 01)`);
  }

  if (!ok) {
    steps.push(
      `Блок ${spec.txHex} не подтвердил выполнение процедуры (${spec.serviceBadge}). Проверьте условия выполнения (IG ON, двигатель заглушен, селектор P) или необходимость разблокировки SecurityAccess (0x27) для данной прошивки.`,
    );
  }

  return {
    success: ok,
    steps,
    finalAngleDeg: null,
  };
}

