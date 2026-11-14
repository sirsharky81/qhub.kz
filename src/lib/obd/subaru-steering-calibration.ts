import type { Elm327Client } from "./elm327";
import { extractHexTokens } from "./hex";
import type { SasCalibrationResult } from "./mitsubishi-modules";
import { formatSubaruUserValue } from "./subaru-decode";
import { unlockSubaruCgwFilterRemove, unlockSubaruMeterSecurityAccess } from "./subaru-meter-variant";
import { getSubaruCandidateCanTargets } from "./subaru-ssm4-modules";
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
 * RoutineControl (31 01) starts for «VDC Sensor Midpoint Setting» on ABS/VDC (7B0)
 * from decrypted `ABS-034..036.srp`, `ABS-028..029.srp`, and `ABS-001A..004B.srp`.
 */
const VDC_MIDPOINT_ROUTINE_HEX = [
  "31010202",
  "31010203",
  "31010204",
  "31010024",
  "31010025",
  "31010026",
  "31010207",
  "31010208",
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
  | "cgw-unlock-mac-check"
  | "fcr-bsd-radar-cal"
  | "avn-headunit-diag"
  | "tlm-dcm-diag";

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
    titleRu: "Калибровка нуля датчика угла руля и G-сенсора (VDC Sensor Midpoint Setting Mode · ABS-001..004, ABS-034..036.srp)",
    buttonLabelRu: "Калибровать нуль руля и G-сенсора (VDC 7B0)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Автомобиль должен стоять на ровной горизонтальной площадке, колёса и руль выставлены строго прямо (около 0.0°), ручник затянут. В ABS-034..036.srp запускаются 31 01 02 02 / 02 03 / 02 04 / 00 24..26.",
    candidatePayloads: ["31010202", "31010203", "31010204", "31010024", "31010025", "31010026"],
  },
  {
    id: "ecm-Clear-learned",
    utilityId: "util-ecm-ewg-roughness",
    srpPrefix: "PU",
    titleRu: "Сброс адаптаций ЭБУ двигателя (Clear Memory 2 — топливные коррекции, дроссель ETCS, IAM · PU-044 / PU-077 / APS-001.srp)",
    buttonLabelRu: "Сбросить адаптации ДВС и дросселя (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 FF00",
    warningRu:
      "Двигатель заглушен, зажигание IG ON, педаль газа отпущена. В PU-044 / PU-077 / APS-001.srp выполняется 31 01 FF 00 00 01 → 31 03 FF 00 (инициализация педали/дросселя 31 01 02 00 в APS-004.srp).",
    candidatePayloads: ["3101FF000001", "3103FF00", "31010200", "14FFFFFF"],
  },
  {
    id: "ecm-avcs-learning",
    utilityId: "util-ecm-ewg-roughness",
    srpPrefix: "PU",
    titleRu: "Обучение и сохранение фазовращателей AVCS и электронного вестгейта EWG (SaveAVCSLearning · PU-063 / PU-072 / PU-073.srp)",
    buttonLabelRu: "Опросить / обучить AVCS и EWG (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Двигатель прогрет (ОЖ > 75 °C), селектор в P. Считывает регистры обучения муфт AVCS (11AB, 11AC, 11AE, 11AF из PU-063/073.srp), шток вестгейта (10D2–10D4, 1622–1624 из PU-072.srp) и запускает рутины 31 01 80 10 / 80 11.",
    candidatePayloads: ["2211AB", "2211AC", "2211AE", "2211AF", "2210D2", "2210D3", "2210D4", "31018010", "31018011"],
  },
  {
    id: "ecm-injector-check",
    utilityId: "util-ecm-elcm-evap",
    srpPrefix: "PU",
    titleRu: "Чтение компенсационных кодов форсунок, обучения ТНВД и рутин топливной системы (PU-030..041 / PU-064 / PU-076.srp)",
    buttonLabelRu: "Проверить коды форсунок и ТНВД (ECM 7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Зажигание IG ON. Читает коды форсунок цилиндров (DID 1020, 102A..102F из PU-030..033.srp), обучение насоса (1030, 1031, 114D, 1260 из PU-040.srp) и рутины 31 01 80 00 / 80 01 / 80 02.",
    candidatePayloads: ["221020", "22102A", "22102B", "22102C", "22102D", "221030", "221031", "22111E", "31018000", "31018001", "31018002"],
  },
  {
    id: "ecm-dpf-gpf-reset",
    utilityId: "util-ecm-elcm-evap",
    srpPrefix: "PU",
    titleRu: "Инспекция и сервисные рутины фильтра DPF / GPF и продувки (commDpfReadListCAN / commGpfWriteData · PU-042..043 / PU-067..078.srp)",
    buttonLabelRu: "Проверка / сброс GPF / DPF (7E0)",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Зажигание IG ON, двигатель заглушен. Читает DID 1140, 1180, 11A0 (PU-042.srp), DID 12E1, 13D8 и запускает рутины 31 01 41 70 00 (PU-067.srp), 31 01 80 20..22 (PU-076.srp), 31 01 80 30..31 (PU-078.srp).",
    candidatePayloads: ["221180", "221140", "2211A0", "2212E1", "2213D8", "3101417000", "31018020", "31018021", "31018030"],
  },
  {
    id: "tcm-at-learning-clear",
    utilityId: "util-cvt-at-inspection",
    srpPrefix: "PU",
    titleRu: "Сброс таблиц адаптации вариатора Lineartronic (AT Learning Memory Clear · PU-027 / PU-028 / PU-044 / PU-077.srp)",
    buttonLabelRu: "Сбросить адаптации вариатора (AT Learning Clear)",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Рычаг в P, ручник включён, IG ON (двигатель заглушен). Точные кадры из PU-044 / PU-077 / PU-027 / PU-028.srp: 31 01 FF 00 00 01 → 31 03 FF 00, 31 01 50 04, 31 01 42 04.",
    candidatePayloads: ["3101FF000001", "31015004", "31014204"],
  },
  {
    id: "tcm-at-learning-start",
    utilityId: "util-cvt-at-inspection",
    srpPrefix: "PU",
    titleRu: "Запуск режима обучения вариатора Lineartronic (AT Learning Mode / commLearnCAN · PU-034..038.srp)",
    buttonLabelRu: "Запустить адаптацию вариатора (AT Learning Mode)",
    txHex: "7E1",
    rxHex: "7E9",
    serviceBadge: "UDS 31 01 70xx",
    warningRu:
      "Температура CVTF 65–85 °C, педаль тормоза нажата до упора, руль прямо, фары и A/C выключены. Точные кадры из PU-034..038.srp: 31 01 70 00 .. 31 01 70 05 и чтение 22 10 30 / 12 5E / 12 60.",
    candidatePayloads: ["221030", "22125E", "221260", "31017000", "31017001", "31017002", "31017003", "31017004", "31017005"],
  },
  {
    id: "epb-pad-release",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Сервисный режим замены задних колодок: РАЗВЕДЕНИЕ электроручника EPB (Pad Exchange Release · ABS-010 / ABS-032 / ABS-038 / ABS-039.srp)",
    buttonLabelRu: "Развести колодки EPB (Сервисный режим)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Поставьте противооткатные упоры! Зажигание IG ON, селектор в P, педаль тормоза не нажата. В ABS-032 / ABS-038 / ABS-010 / ABS-039.srp читается 22 10 2B и запускается 31 01 03 01 / 31 01 01 23.",
    candidatePayloads: ["22102B", "31010301", "31010123", "31010209"],
  },
  {
    id: "epb-pad-return",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Выход из сервисного режима замены колодок: СВЕДЕНИЕ электроручника EPB (Pad Exchange Return · ABS-010 / ABS-032 / ABS-038 / ABS-039.srp)",
    buttonLabelRu: "Свести колодки EPB (Завершить замену)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Убедитесь, что новые колодки и суппорты установлены на место! В ABS-032 / ABS-038 / ABS-010 / ABS-039.srp запускается 31 01 03 00 / 31 01 01 22.",
    candidatePayloads: ["22102B", "31010300", "31010122", "3101020A"],
  },
  {
    id: "epb-stroke-cal",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Калибровка хода и усилия затяжки электроручника EPB (Stroke / Force Test · ABS-033 / ABS-040..045.srp)",
    buttonLabelRu: "Откалибровать ход и затяжку EPB",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 31 01",
    warningRu:
      "Выполняется после сведения новых задних колодок. В ABS-033 / ABS-040..045.srp запускаются 31 01 03 03 и 31 01 02 0B .. 02 0E.",
    candidatePayloads: ["22102B", "31010303", "3101020B", "3101020C", "3101020D", "3101020E"],
  },
  {
    id: "ebb-air-bleeding",
    utilityId: "util-epb-brake-service",
    srpPrefix: "ABS / EBB",
    titleRu: "Проверка и прокачка гидравлического контура электробустера тормозов EBB (EBB-001..009.srp)",
    buttonLabelRu: "Проверить / прокачать контур EBB (7B0)",
    txHex: "7B0",
    rxHex: "7B8",
    serviceBadge: "UDS 22 / 31 01 04xx",
    warningRu:
      "Зажигание IG ON, автомобиль неподвижен. В EBB-006..009.srp читаются 22 31 44, 22 10 01, 22 15 01, 22 28 C4/C5 и запускаются 31 01 04 00 / 04 08 / 04 0F / 04 13.",
    candidatePayloads: ["223144", "221001", "221501", "2228C4", "2228C5", "31010400", "31010408", "3101040F", "31010413"],
  },
  {
    id: "eyesight-camera-check",
    utilityId: "util-eyesight-camera-check",
    srpPrefix: "ADA / FSC / MCAM",
    titleRu: "Чтение 12-колоночного варианта и готовности стереокамеры EyeSight (ADA-002 / ADA-038 / ADA-040..041 / MCAM-010.srp)",
    buttonLabelRu: "Проверить вариант и статус EyeSight (787)",
    txHex: "787",
    rxHex: "78F",
    serviceBadge: "UDS 22 309x / 31 01",
    warningRu:
      "Зажигание IG ON, лобовое стекло чистое. Читает вариантные DID 3091..309D (ADA-002/038.srp), 3501..3506 (ADA-031/032.srp), A001 (MCAM-009.srp), F182 и проверяет рутины 31 01 11 04 / 11 05 / 21 03.",
    candidatePayloads: ["22F182", "22F18E", "223091", "223092", "223093", "223094", "22309D", "223501", "22A001"],
  },
  {
    id: "eyesight-precrash-history",
    utilityId: "util-eyesight-camera-check",
    srpPrefix: "ADA / FSC / MCAM",
    titleRu: "Чтение истории срабатываний автоторможения Pre-Crash / AEB EyeSight (preCrushReadSave · c7YcwYGEJWLZiB6.mHZ)",
    buttonLabelRu: "Считать историю Pre-Crash / AEB (787)",
    txHex: "787",
    rxHex: "78F",
    serviceBadge: "UDS 22 40xx / 43Ex",
    warningRu:
      "Зажигание IG ON. Читает регистры истории AEB из таблиц c7YcwYGEJWLZiB6.mHZ (DID 4001..4006) и CBG7BrLIdHEhG.mHZ (DID 43E1..43E3) + ошибки 19 02 FF.",
    candidatePayloads: ["1902FF", "224001", "224002", "224003", "2243E1", "2243E2", "2243E3", "22F182"],
  },
  {
    id: "meter-read-variant",
    utilityId: "util-eps-sas-zero",
    srpPrefix: "MET",
    titleRu: "Чтение вариантной таблицы A000..A028 и калибровки приборной панели (readMetVariant · MET-001 / MET-002 / MET-008.srp)",
    buttonLabelRu: "Считать вариант A000..A028 приборки (783)",
    txHex: "783",
    rxHex: "78B",
    serviceBadge: "UDS 22 A0xx / 0250",
    warningRu:
      "Зажигание IG ON. Читает битовую карту поддержки A000/A020, регион A002 (02=U4, 03=C0, 05=U5, 06=C5), единицы A011 (FF=°F, 00=°C), X-Mode A007, 0250/0251 и датчики бака 1041/1042.",
    candidatePayloads: ["22A000", "22A001", "22A002", "22A007", "22A011", "22A016", "22A020", "22A024", "220250", "220251", "2210C2", "221041", "221042"],
  },
  {
    id: "immo-key-count-check",
    utilityId: "util-keyless-starter-check",
    srpPrefix: "IMM / KEY / SMA",
    titleRu: "Проверка количества зарегистрированных смарт-ключей и истории (IMM-069 / IMM-073 / IMM-015.srp · 7B4 / 751)",
    buttonLabelRu: "Считать кол-во смарт-ключей (7B4 / 751)",
    txHex: "7B4",
    rxHex: "7BC",
    serviceBadge: "UDS 22 1378",
    warningRu:
      "Зажигание IG ON, смарт-ключ внутри салона. Читает фактическое количество прописанных ключей (DID 1378), статус транспондера/защёлки (DID 1360/137A/1220) и номер детали (F18E).",
    candidatePayloads: ["221378", "221360", "22137A", "221220", "22F18E"],
  },
  {
    id: "tpms-read-id-status",
    utilityId: "util-tpms-inspection",
    srpPrefix: "TPM",
    titleRu: "Инспекция приёмника TPMS в BIU и запуск опроса датчиков (TPM-001 / TPM-003.srp · 752)",
    buttonLabelRu: "Опросить приёмник и датчики TPMS (752)",
    txHex: "752",
    rxHex: "75A",
    serviceBadge: "UDS 22 / 31 01 A000",
    warningRu:
      "Зажигание IG ON. Опрашивает регистры давления колёс 1–4 (1021–1024), питание BIU (101B) и штатную рутину TPM-001/003.srp (31 01 A0 00 → 31 03 A0 00).",
    candidatePayloads: ["221021", "221022", "221023", "221024", "22101B", "3101A000"],
  },
  {
    id: "iss-battery-reset",
    utilityId: "util-tcm-eop-startstop",
    srpPrefix: "ISS",
    titleRu: "Инспекция и сброс адаптации АКБ Auto Start-Stop после замены аккумулятора (ISS-001..009.srp)",
    buttonLabelRu: "Сбросить адаптацию АКБ Start-Stop",
    txHex: "7E0",
    rxHex: "7E8",
    serviceBadge: "UDS 31 01 2000 / 22",
    warningRu:
      "Выполняется после установки нового аккумулятора EFB / AGM или полной зарядки АКБ. В ISS-001..009.srp читаются DID 10F8, 14E0, 14F8, 1420 и запускается сброс 31 01 20 00 → 31 03 20 00.",
    candidatePayloads: ["2210F8", "2214E0", "2214F8", "221420", "31012000"],
  },
  {
    id: "ac-flap-init",
    utilityId: "util-ac-hvac-actuators",
    srpPrefix: "AC",
    titleRu: "Калибровка сервоприводов заслонок и чтение настроек климат-контроля (AC-002..009.srp · 0x1008290C)",
    buttonLabelRu: "Калибровать заслонки и опросить климат (7C4)",
    txHex: "7C4",
    rxHex: "7CC",
    serviceBadge: "UDS 31 01 02xx / 22",
    warningRu:
      "Зажигание IG ON. В AC-002..009.srp читаются настройки климата (DID 10E1, 12BF, 12B1, 12B3, 13D2..13D6) и запускаются калибровки приводов 31 01 02 AC, 31 01 02 B4, 31 01 02 B5, 31 01 02 B6.",
    candidatePayloads: ["2210E1", "2212BF", "2212B1", "2212B3", "2213D2", "2213D3", "310102AC", "310102B4", "310102B5", "310102B6"],
  },
  {
    id: "dms-seat-memory-read",
    utilityId: "util-dms-driverfocus",
    srpPrefix: "DMS / PSM / DMI",
    titleRu: "Опрос профилей камеры DriverFocus DMS и памяти сидений/зеркал PSM/DMI (DMS-001..003, PSM-001..004, DMI-001..004.srp · 0x10081624)",
    buttonLabelRu: "Опросить профили DMS и память сидений (763)",
    txHex: "763",
    rxHex: "76B",
    serviceBadge: "UDS 22",
    warningRu:
      "Зажигание IG ON. Читает регистры DMS-001.srp (1060, 1061) и таблицы DID памяти сидений/зеркал из FHIUtilityCtrlNK.dll (3201..3206, 350B..3510, 142A..142E, 145E..1466).",
    candidatePayloads: ["221060", "221061", "223201", "223202", "22350B", "22350C", "22142A", "22145E", "22F18E"],
  },
  {
    id: "rab-sonar-history",
    utilityId: "util-rab-sonar-check",
    srpPrefix: "RAB / FCR / SRH",
    titleRu: "Инспекция калибровки задних сонаров и выгрузка истории автоторможения RAB (RABSave · RAB-001..003.srp)",
    buttonLabelRu: "Проверить сонары и историю RAB (786)",
    txHex: "786",
    rxHex: "78E",
    serviceBadge: "UDS 22 10Ax",
    warningRu:
      "Зажигание IG ON, датчики в заднем бампере чистые. Читает точные DID из RAB-001..002.srp: 101E, 1033, 10A7, 10A8, 10A9, 10AA, 10AB и ошибки 19 02 FF.",
    candidatePayloads: ["22101E", "221033", "2210A7", "2210A8", "2210A9", "2210AA", "2210AB", "22F18E", "1902FF"],
  },
  {
    id: "srh-headlight-zero",
    utilityId: "util-srh-adb-headlight",
    srpPrefix: "RAB / FCR / SRH",
    titleRu: "Инициализация нулевого уровня корректора и поворотных фар SRH / ADB (LCT-001..003.srp)",
    buttonLabelRu: "Калибровать нуль фар SRH / ADB (74C)",
    txHex: "74C",
    rxHex: "754",
    serviceBadge: "UDS 31 01 020x / 22",
    warningRu:
      "Автомобиль на ровной площадке без груза, руль прямо (0.0°), IG ON. В LCT-001..003.srp читаются 22 10 A1, 10 A2, 10 1A, 10 1B и запускаются рутины 31 01 02 00, 31 01 02 01, 31 01 02 02.",
    candidatePayloads: ["2210A1", "2210A2", "22101A", "22101B", "31010200", "31010201", "31010202"],
  },
  {
    id: "cgw-unlock-mac-check",
    utilityId: "util-keyless-starter-check",
    srpPrefix: "TLM / CGW / MAC",
    titleRu: "Диагностика Центрального шлюза CGW и проверка MAC-синхронизации блоков (CGW-001 / MAC-001..002.srp)",
    buttonLabelRu: "Опросить шлюз CGW и MAC-статус (750)",
    txHex: "750",
    rxHex: "758",
    serviceBadge: "UDS 22 / 31 01",
    warningRu:
      "Зажигание IG ON. Читает регистры CGW-001.srp и MAC-001..002.srp (0250, 0251, 1020, 102E, 102F, 1033, 103A, 103B) и проверяет рутину 31 01 02 0C.",
    candidatePayloads: ["220250", "220251", "221020", "22102E", "22102F", "221033", "22103A", "22103B", "22F18E"],
  },
  {
    id: "fcr-bsd-radar-cal",
    utilityId: "util-rab-sonar-check",
    srpPrefix: "RAB / FCR / SRH",
    titleRu: "Калибровка и проверка углов боковых/передних радаров слепых зон BSD / RCTA / FCR (FCR-001..004, FSC-009..012.srp)",
    buttonLabelRu: "Проверить / калибровать радары BSD / FCR (74C / 786)",
    txHex: "74C",
    rxHex: "754",
    serviceBadge: "UDS 22 / 31 01 100x",
    warningRu:
      "Зажигание IG ON. Читает углы и статус радаров FCR-001..004.srp (22 10 A1, 10 A3, 10 A4, 10 A5) и FSC-009..012.srp (22 10 68, 10 69, 10 6D), запускает калибровку луча 31 01 10 01 / 10 02 / 10 03 / 10 0F.",
    candidatePayloads: ["2210A1", "2210A3", "2210A4", "2210A5", "221068", "221069", "22106D", "31011001", "31011002", "31011003", "3101100F"],
  },
  {
    id: "avn-headunit-diag",
    utilityId: "util-dms-driverfocus",
    srpPrefix: "AVN",
    titleRu: "Диагностика мультимедиа и навигации Harman CP1 / AVN (AVN-001..003.srp)",
    buttonLabelRu: "Опросить мультимедиа AVN (783 / 7C4)",
    txHex: "783",
    rxHex: "78B",
    serviceBadge: "UDS 22 10Cx / 31 01",
    warningRu:
      "Зажигание IG ON. Читает регистры состояния и подключённых антенн AVN-001..003.srp (22 10 C0 .. 10 CA) и тест 31 01 00 50.",
    candidatePayloads: ["2210C0", "2210C1", "2210C2", "2210C3", "2210C4", "2210C5", "2210C6", "2210C7", "2210C8", "2210CA", "31010050"],
  },
  {
    id: "tlm-dcm-diag",
    utilityId: "util-keyless-starter-check",
    srpPrefix: "TLM / CGW / MAC",
    titleRu: "Диагностика телематического блока Starlink DCM / eCall (TLM-001..051.srp · 765)",
    buttonLabelRu: "Опросить блок телематики DCM (765)",
    txHex: "765",
    rxHex: "76D",
    serviceBadge: "UDS 22 10Dx",
    warningRu:
      "Зажигание IG ON. Читает регистры состояния телематического модуля TLM-048..051.srp (22 10 32, 10 DD, 10 DE, 10 DF, F18E, F197).",
    candidatePayloads: ["22F18E", "22F197", "221032", "2210DD", "2210DE", "2210DF"],
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

export interface SubaruUdsProcedureResult extends SasCalibrationResult {
  decodedSummaries: string[];
}

/**
 * Executes an arbitrary Subaru UDS/SSM4 Work Support or Active Test payload sequence
 * with optional CGW FilterRemove (`763`/`750`), TesterPresent (`3E 00`), automatic
 * SecurityAccess (`0x27`) retry on `NRC 33`, and `31 03` polling after `31 01`.
 */
export async function executeSubaruUdsProcedure(
  elm: Elm327Client,
  options: {
    txHex: string;
    rxHex: string;
    payloads: readonly string[];
    stopOnWriteSuccess?: boolean;
    requireCgwFilterRemove?: boolean;
    autoSecurityAccess?: boolean;
    preferEcuKinds?: readonly number[];
  },
): Promise<SubaruUdsProcedureResult> {
  const cleanTx = options.txHex.trim().toUpperCase();
  const cleanRx = options.rxHex.trim().toUpperCase();
  const targets = getSubaruCandidateCanTargets(cleanTx, cleanRx);
  const steps: string[] = [];
  const decodedSummaries: string[] = [];

  if (options.requireCgwFilterRemove || cleanTx === "787") {
    try {
      await unlockSubaruCgwFilterRemove(elm, steps);
    } catch {
      /* gateway filter removal is optional on older platforms */
    }
  } else if (cleanTx !== "750") {
    try {
      await openSubaruModuleSession(elm, 0x750, 0x758);
      steps.push("750→758 (CGW): Расширенная сессия шлюза открыта (10 03)");
    } catch {
      /* Gateway may not require explicit 10 03 */
    }
  }

  let ok = false;
  const stopOnWrite = options.stopOnWriteSuccess ?? true;

  for (const target of targets) {
    const tTx = target.txHex;
    const tRx = target.rxHex;
    const tx = Number.parseInt(tTx, 16);
    const rx = Number.parseInt(tRx, 16);
    try {
      await openSubaruModuleSession(elm, tx, rx);
      steps.push(`${tTx}→${tRx}: Открыта расширенная диагностическая сессия (10 03)`);
    } catch (e) {
      steps.push(
        `${tTx}→${tRx}: нет ответа на 10 03 (${e instanceof Error ? e.message : String(e)})`,
      );
      continue;
    }

    let saTried = false;
    try {
      for (const rawPayload of options.payloads) {
        const payloadHex = rawPayload.replace(/\s+/g, "").toUpperCase();
        const label = payloadHex.replace(/(.{2})/g, "$1 ").trim();
        const sid = Number.parseInt(payloadHex.slice(0, 2), 16);
        try {
          try {
            await elm.sendPayload("3E00", 1_000);
          } catch {
            /* ignore */
          }
          let raw = await elm.sendPayload(payloadHex, 8_000);
          let cleanRaw = raw.replace(/>/g, "").trim();
          let parsed = parseUdsResponse(raw, sid);

          if (
            parsed.kind === "negative" &&
            parsed.nrc === 0x33 &&
            !saTried &&
            (options.autoSecurityAccess ?? true)
          ) {
            saTried = true;
            steps.push(`${tTx}→${tRx}: Получен NRC 33 (требуется SecurityAccess 0x27) — пробуем разблокировку…`);
            const sa = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
              preferNonMeterAes: tTx !== "783",
              preferEcuKinds: options.preferEcuKinds,
              maxAesAttempts: 12,
            });
            if (sa.unlocked) {
              await openSubaruModuleSession(elm, tx, rx);
              raw = await elm.sendPayload(payloadHex, 8_000);
              cleanRaw = raw.replace(/>/g, "").trim();
              parsed = parseUdsResponse(raw, sid);
            }
          }

          steps.push(`${tTx}→${tRx}: Запрос ${label} → ${cleanRaw || "нет ответа"}`);
          if (parsed.kind === "positive") {
            const summary = formatSubaruUserValue(parsed.payload, sid, tTx);
            if (summary) decodedSummaries.push(summary);
          }

          if (actionPayloadResponseOk(raw, payloadHex)) {
            ok = true;
            if (sid === 0x31 && payloadHex.startsWith("3101") && payloadHex.length >= 8) {
              const rid = payloadHex.slice(4, 8);
              try {
                const rawPoll = await elm.sendPayload(`3103${rid}`, 5_000);
                const cleanPoll = rawPoll.replace(/>/g, "").trim();
                steps.push(
                  `${tTx}→${tRx}: Опрос результата 31 03 ${rid.slice(0, 2)} ${rid.slice(2, 4)} → ${cleanPoll || "нет ответа"}`,
                );
                const pollParsed = parseUdsResponse(rawPoll, 0x31);
                if (pollParsed.kind === "positive") {
                  const pollSummary = formatSubaruUserValue(pollParsed.payload, 0x31, tTx);
                  if (pollSummary) decodedSummaries.push(pollSummary);
                }
              } catch {
                /* optional on some ECUs */
              }
            }
            if (stopOnWrite && (sid === 0x31 || sid === 0x2f || sid === 0x14 || sid === 0x04)) {
              break;
            }
          }
        } catch (e) {
          steps.push(
            `${tTx}→${tRx}: Запрос ${label} → ошибка: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } finally {
      await closeSubaruModuleSession(elm);
      steps.push(`${tTx}→${tRx}: Сессия завершена (10 01)`);
    }

    if (ok) break;
  }

  return {
    success: ok,
    steps,
    decodedSummaries,
    finalAngleDeg: null,
  };
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

  const res = await executeSubaruUdsProcedure(elm, {
    txHex: spec.txHex,
    rxHex: spec.rxHex,
    payloads: spec.candidatePayloads,
    requireCgwFilterRemove: spec.txHex === "787",
    autoSecurityAccess: true,
  });
  const steps = [...res.steps];
  let ok = res.success;

  // Fallback for immo-key-count-check: if 7B4 (H-type SGP) did not respond, probe 751 (D-type) and 752 (BIU)
  if (!ok && actionId === "immo-key-count-check") {
    for (const fallback of [
      { tx: 0x751, rx: 0x759, name: "751→759 (D-type Keyless)", dids: ["221378", "221360", "22F18E"] },
      { tx: 0x752, rx: 0x75a, name: "752→75A (BIU Key-Start)", dids: ["221158", "22F18E"] },
    ]) {
      try {
        await openSubaruModuleSession(elm, fallback.tx, fallback.rx);
        for (const payloadHex of fallback.dids) {
          const raw = await elm.sendPayload(payloadHex, 3_000);
          const cleanRaw = raw.replace(/>/g, "").trim();
          steps.push(`${fallback.name}: Запрос ${payloadHex} → ${cleanRaw || "нет ответа"}`);
          if (actionPayloadResponseOk(raw, payloadHex)) {
            ok = true;
          }
        }
        await closeSubaruModuleSession(elm);
        if (ok) break;
      } catch {
        /* ignore */
      }
    }
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

