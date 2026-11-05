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
  | "ecm-avcs-learning"
  | "ecm-injector-check"
  | "ecm-dpf-gpf-reset"
  | "tcm-at-learning-clear"
  | "tcm-at-learning-start"
  | "epb-pad-release"
  | "epb-pad-return"
  | "epb-stroke-cal"
  | "ebb-air-bleeding"
  | "eyesight-camera-check"
  | "eyesight-precrash-history"
  | "meter-read-variant"
  | "immo-key-count-check"
  | "tpms-read-id-status"
  | "iss-battery-reset"
  | "ac-flap-init"
  | "dms-seat-memory-read"
  | "rab-sonar-history"
  | "srh-headlight-zero"
  | "cgw-unlock-mac-check";

export interface SubaruServiceActionSpec {
  id: SubaruServiceActionId;
  utilityId: string;
  srpPrefix: string;
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
    srpPrefix: "ABS / EBB",
    titleRu: "Калибровка нуля датчика угла руля и G-сенсора (VDC Sensor Midpoint Setting Mode · ABS-001..045.srp)",
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
    srpPrefix: "PU",
    titleRu: "Сброс адаптаций ЭБУ двигателя (Clear Memory 2 — топливные коррекции, дроссель ETCS, IAM/детонация · PU-001..078.srp)",
    buttonLabelRu: "Сбросить адаптации ДВС и дросселя (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 / 14",
    warningRu:
      "Двигатель должен быть заглушен, зажигание включено (IG ON), педаль газа отпущена. После сброса выключите зажигание на 10 с, затем включите IG ON на 15 с для самообучения заслонки ETCS перед запуском.",
    candidatePayloads: ["31010101", "31010201", "31010F01", "14FFFFFF", "04"],
  },
  {
    id: "ecm-avcs-learning",
    utilityId: "util-ecm-ewg-roughness",
    srpPrefix: "PU",
    titleRu: "Обучение и сохранение фазовращателей AVCS и электронного вестгейта EWG (SaveAVCSLearning · PU-012..038.srp)",
    buttonLabelRu: "Запустить обучение AVCS / EWG (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 / 22",
    warningRu:
      "Двигатель прогрет (ОЖ > 75 °C), селектор в P, кондиционер выключен. Процедура считывает и фиксирует начальные углы муфт AVCS и положение штока вестгейта (10D2–10D4).",
    candidatePayloads: ["31010301", "31010401", "2210D2", "2210D3", "2210D4"],
  },
  {
    id: "ecm-injector-check",
    utilityId: "util-ecm-elcm-evap",
    srpPrefix: "PU",
    titleRu: "Чтение и проверка компенсационных кодов форсунок и обучения ТНВД (PopupInjectorCodeInput / commPumpListKWP · PU-040..062.srp)",
    buttonLabelRu: "Проверить коды форсунок и ТНВД (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Зажигание IG ON. Опрашивает регистры давления ТНВД (111E), длительности впрыска PFI/DI (10A3, 13EF, 13F0) и статус обучения топливного насоса.",
    candidatePayloads: ["22111E", "2210A3", "2213EF", "2213F0", "31010501"],
  },
  {
    id: "ecm-dpf-gpf-reset",
    utilityId: "util-ecm-elcm-evap",
    srpPrefix: "PU",
    titleRu: "Инспекция и сброс счётчика сажи фильтра DPF / GPF и разжижения масла (commGpfWriteData / setGpfDataValue · PU-063..078.srp)",
    buttonLabelRu: "Проверка / сброс счётчика GPF / DPF (7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 / 22",
    warningRu:
      "Зажигание IG ON, двигатель заглушен. Выполняется после сервисной регенерации или замены фильтра GPF/DPF и моторного масла.",
    candidatePayloads: ["31010601", "31010701", "2212E2", "2213EC"],
  },
  {
    id: "tcm-at-learning-clear",
    utilityId: "util-cvt-at-inspection",
    srpPrefix: "PU",
    titleRu: "Сброс таблиц адаптации вариатора Lineartronic (AT Learning Memory Clear / Clear Memory 2 · PU-001..025.srp)",
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
    srpPrefix: "PU",
    titleRu: "Запуск режима обучения вариатора Lineartronic (AT Learning Mode / commLearnCAN · PU-001..025.srp)",
    buttonLabelRu: "Запустить адаптацию вариатора (AT Learning Mode)",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Температура CVTF должна быть в окне 65–85 °C, автомобиль неподвижен, педаль тормоза нажата до упора, руль прямо, кондиционер и фары выключены.",
    candidatePayloads: ["31010202", "31010102", "31010302", "31011001", "221243"],
  },
  {
    id: "epb-pad-release",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Сервисный режим замены задних колодок: РАЗВЕДЕНИЕ электроручника EPB (Pad Exchange Release · ABS-018..031.srp)",
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
    srpPrefix: "ABS / EBB",
    titleRu: "Выход из сервисного режима замены колодок: СВЕДЕНИЕ электроручника EPB (Pad Exchange Return · ABS-018..031.srp)",
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
    srpPrefix: "ABS / EBB",
    titleRu: "Калибровка хода и усилия затяжки электроручника EPB (EPB Clamp Force / Stroke Calibration · ABS-030..045.srp)",
    buttonLabelRu: "Откалибровать ход и затяжку EPB",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Выполняется после сведения новых задних колодок. Автомобиль неподвижен на ровной поверхности, IG ON.",
    candidatePayloads: ["31010503", "31010403", "31010303", "3101200D", "22200D"],
  },
  {
    id: "ebb-air-bleeding",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Проверка и прокачка гидравлического контура ABS / электробустера тормозов EBB (EBB-001..009.srp)",
    buttonLabelRu: "Проверить контур EBB / давление суппортов (7B0)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Зажигание IG ON, автомобиль неподвижен. Выполняет контроль давления ГТЦ (1001), целевого давления (1501) и передних суппортов FR/FL (28C4/28C5).",
    candidatePayloads: ["221001", "221501", "2228C4", "2228C5", "31010601"],
  },
  {
    id: "eyesight-camera-check",
    utilityId: "util-eyesight-camera-check",
    srpPrefix: "ADA / FSC / MCAM",
    titleRu: "Проверка юстировки, вариантного кода и готовности стереокамеры EyeSight (SaveCameraAdjastMode / CheckAdaVariantDid · ADA-001..041.srp)",
    buttonLabelRu: "Проверить калибровку и вариант EyeSight (787)",
    txHex: "787",
    rxHex: "78F",
    serviceBadge: "UDS 22 / 10 03",
    warningRu:
      "Зажигание IG ON, лобовое стекло чистое. Выгружает калибровочный ID (F182), паспорт камеры (F18E, F197) и проверяет готовность к статической/дорожной юстировке.",
    candidatePayloads: ["22F182", "22F18E", "22F197", "221000"],
  },
  {
    id: "eyesight-precrash-history",
    utilityId: "util-eyesight-camera-check",
    srpPrefix: "ADA / FSC / MCAM",
    titleRu: "Чтение истории срабатываний автоторможения Pre-Crash / AEB и счётчиков отключения EyeSight (preCrushReadSave · Keycode 49232)",
    buttonLabelRu: "Считать историю Pre-Crash / AEB (787)",
    txHex: "787",
    rxHex: "78F",
    serviceBadge: "UDS 22 / 19 02",
    warningRu:
      "Зажигание IG ON. Опрашивает регистры истории событий предаварийного торможения и коды временной приостановки камеры EyeSight.",
    candidatePayloads: ["1902FF", "221000", "221020", "221040", "22F182"],
  },
  {
    id: "meter-read-variant",
    utilityId: "util-eps-sas-zero",
    srpPrefix: "MET",
    titleRu: "Чтение вариантной конфигурации приборной панели и датчиков полубаков (readMetVariant / MET-001..010.srp)",
    buttonLabelRu: "Считать вариант и калибровку приборки (783)",
    txHex: "783",
    rxHex: "78B",
    serviceBadge: "UDS 22",
    warningRu:
      "Зажигание IG ON. Считывает конфигурацию комбинации приборов (783 → 78B), диммер освещённости (1062) и калибровку обоих датчиков уровня топлива (1041/1042).",
    candidatePayloads: ["220250", "220251", "22F190", "22F18E", "22F182", "221041", "221042", "221062", "221007"],
  },
  {
    id: "immo-key-count-check",
    utilityId: "util-keyless-starter-check",
    srpPrefix: "IMM / KEY / SMA",
    titleRu: "Проверка количества зарегистрированных смарт-ключей, питания и реле запуска (imb_in_ReadKeyNumConfirm / KEY-001..016, SMA-001..021.srp)",
    buttonLabelRu: "Проверить смарт-ключи и реле запуска (750)",
    txHex: "750",
    rxHex: "758",
    serviceBadge: "UDS 22",
    warningRu:
      "Зажигание IG ON, смарт-ключ внутри салона. Проверяет регистры блока бесключевого доступа и иммобилайзера без стирания ключей.",
    candidatePayloads: ["22104E", "221052", "221057", "221058", "221059", "22F18E"],
  },
  {
    id: "tpms-read-id-status",
    utilityId: "util-tpms-inspection",
    srpPrefix: "TPM",
    titleRu: "Инспекция приёмника TPMS в боди-модуле BIU и опрос всех 4 колёсных датчиков (TPM-001..004.srp)",
    buttonLabelRu: "Опросить приёмник и датчики TPMS (752)",
    txHex: "752",
    rxHex: "75A",
    serviceBadge: "UDS 22",
    warningRu:
      "Зажигание IG ON. Опрашивает регистры давления колёс 1–4 (1021–1024), питание BIU (101B) и счётчик IG (101E).",
    candidatePayloads: ["221021", "221022", "221023", "221024", "22101B"],
  },
  {
    id: "iss-battery-reset",
    utilityId: "util-tcm-eop-startstop",
    srpPrefix: "ISS",
    titleRu: "Сброс адаптации и счётчиков деградации АКБ Auto Start-Stop после замены аккумулятора (ISS-001..009.srp)",
    buttonLabelRu: "Сбросить адаптацию АКБ Start-Stop",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01 / 22",
    warningRu:
      "Выполняется после установки нового аккумулятора EFB / AGM или полной зарядки АКБ. Зажигание IG ON, двигатель заглушен.",
    candidatePayloads: ["31011401", "31010401", "31010501", "221472", "221473", "2214F8"],
  },
  {
    id: "ac-flap-init",
    utilityId: "util-ac-hvac-actuators",
    srpPrefix: "AC",
    titleRu: "Калибровка крайних положений сервоприводов заслонок климат-контроля (Auto A/C Actuator Reset · AC-001..009.srp)",
    buttonLabelRu: "Калибровать заслонки климата (7C4)",
    txHex: "7C4",
    rxHex: "7CC",
    serviceBadge: "UDS 31 01 / 22",
    warningRu:
      "Зажигание IG ON. Сервоприводы заслонок смешивания (Air Mix) и направления обдува (Mode) пройдут от упора до упора для записи крайних точек.",
    candidatePayloads: ["31010101", "31010201", "31011201", "22122D", "22122E", "22122F"],
  },
  {
    id: "dms-seat-memory-read",
    utilityId: "util-dms-driverfocus",
    srpPrefix: "DMS / PSM / DMI",
    titleRu: "Опрос профилей распознавания лица водителя DriverFocus и памяти сидений (saveDriverMonitoring · DMS-001..003, PSM-001..004.srp)",
    buttonLabelRu: "Опросить камеру DriverFocus DMS (763)",
    txHex: "763",
    rxHex: "76B",
    serviceBadge: "UDS 22",
    warningRu:
      "Зажигание IG ON. Проверяет текущий распознанный профиль водителя (1025) и паспортные калибровки блока DMS.",
    candidatePayloads: ["221025", "22F18E", "22F197", "221000"],
  },
  {
    id: "rab-sonar-history",
    utilityId: "util-rab-sonar-check",
    srpPrefix: "RAB / FCR / SRH",
    titleRu: "Инспекция калибровки задних сонаров и выгрузка статуса автоторможения RAB (RABSave · RAB-001..003.srp)",
    buttonLabelRu: "Проверить калибровку сонаров RAB (786)",
    txHex: "786",
    rxHex: "78E",
    serviceBadge: "UDS 22 / 19 02",
    warningRu:
      "Зажигание IG ON, датчики в заднем бампере чистые. Проверяет калибровочный ID (F182), ошибки и питание блока RAB.",
    candidatePayloads: ["22F182", "22F18E", "22101B", "1902FF"],
  },
  {
    id: "srh-headlight-zero",
    utilityId: "util-srh-adb-headlight",
    srpPrefix: "RAB / FCR / SRH",
    titleRu: "Инициализация нулевого уровня корректора и поворотных фар SRH / ADB (LCT-001..003.srp)",
    buttonLabelRu: "Калибровать нуль фар SRH / ADB (74C)",
    txHex: "74C",
    rxHex: "754",
    serviceBadge: "UDS 31 01 / 22",
    warningRu:
      "Автомобиль на ровной горизонтальной площадке без груза в багажнике, водитель за рулём, руль строго прямо (0.0°), зажигание IG ON.",
    candidatePayloads: ["31010101", "31010201", "31011035", "221035", "221036"],
  },
  {
    id: "cgw-unlock-mac-check",
    utilityId: "util-keyless-starter-check",
    srpPrefix: "TLM / CGW / MAC",
    titleRu: "Открытие сервисной сессии Центрального шлюза CGW и диагностика телематики DCM (cgwSidFilterRemove / TLM-001..051, CGW-001, MAC-001.srp)",
    buttonLabelRu: "Разблокировать сессию шлюза CGW и проверить TLM",
    txHex: "750",
    rxHex: "758",
    serviceBadge: "UDS 10 03 / 22",
    warningRu:
      "Зажигание IG ON. Открывает расширенную сессию на Центральном шлюзе (750 → 758) для снятия фильтра сервисных команд и проверяет статус питания.",
    candidatePayloads: ["1003", "22F18E", "22104E", "221067"],
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
      const sid = Number.parseInt(payloadHex.slice(0, 2), 16);
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
          // Stop on first accepted write/routine command (0x31, 0x2F, 0x14, 0x04); continue reading if 0x22/0x10
          if (sid === 0x31 || sid === 0x2f || sid === 0x14 || sid === 0x04) {
            break;
          }
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

