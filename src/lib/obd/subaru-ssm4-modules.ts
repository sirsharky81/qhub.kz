import type { ModuleDtcItem, ModuleDtcReport, ModuleDtcTarget } from "./obd-session";
import {
  SSM4_FULL_SYSTEMS,
  SSM4_SIGNALS,
  SSM4_VEHICLES,
  matchSsm4VehicleByVin,
  type Ssm4Group,
  type Ssm4SignalDef,
  type Ssm4SystemEntry,
  type Ssm4VehicleModel,
} from "./subaru-ssm4-catalog";
import type { SubaruServiceActionId } from "./subaru-steering-calibration";

export type SubaruFunctionTabId =
  | "dtc"
  | "cancel-code"
  | "data-monitor"
  | "active-test"
  | "work-support"
  | "customize"
  | "ecu-info";

export type SubaruDtcSeverity = "current" | "history";
export type SubaruBlockScanStatus =
  | "current"
  | "history"
  | "no_dtc"
  | "not_detected"
  | "unscanned";

export interface SubaruVinDecodedInfo {
  vin: string;
  modelYear: number | null;
  plantCountry: "Япония (Gunma)" | "США (SIA Lafayette)" | "Неизвестно";
  chassisHint: string | null;
  vehicle: Ssm4VehicleModel | null;
}

export interface SubaruActiveTestItem {
  id: string;
  nameEn: string;
  nameRu: string;
  txHex: string;
  rxHex: string;
  explanationRu: string;
  conditionsRu: string[];
  risk: "safe" | "actuator";
  /** Optional UDS control payloads (e.g. 2F ... or 31 01 ...). */
  onPayloads?: readonly string[];
  offPayloads?: readonly string[];
  /** Live read DIDs / OBD PIDs to verify the actuator state in real time. */
  monitorDids: readonly { didHex: string; labelRu: string }[];
}

export interface SubaruWorkSupportItem {
  id: string;
  nameEn: string;
  nameRu: string;
  txHex: string;
  rxHex: string;
  category: "read" | "calibration" | "reset" | "learning" | "inspection";
  srpRef?: string;
  explanationRu: string;
  conditionsRu: string[];
  /** Links to an existing `SUBARU_SERVICE_ACTIONS` id when available, or uses `payloads`. */
  serviceActionId?: SubaruServiceActionId;
  payloads?: readonly string[];
  stopOnWriteSuccess?: boolean;
  requireCgwFilterRemove?: boolean;
  liveDids?: readonly { didHex: string; labelRu: string }[];
  confirmRequired?: boolean;
}

export interface SubaruCancelCodeSpec {
  id: string;
  nameEn: string;
  nameRu: string;
  txHex: string;
  rxHex: string;
  explanationRu: string;
  readPayloads: readonly string[];
}

export interface SubaruCustomizeOptionSpec {
  id: string;
  nameEn: string;
  nameRu: string;
  txHex: string;
  rxHex: string;
  didHex: string;
  categoryRu: string;
  defaultText: string;
  options: readonly { labelEn: string; labelRu: string; writeHex?: string }[];
  noteRu?: string;
}

export interface SubaruBlockProfile {
  system: Ssm4SystemEntry;
  tabs: readonly SubaruFunctionTabId[];
  activeTests: readonly SubaruActiveTestItem[];
  workSupport: readonly SubaruWorkSupportItem[];
  cancelCodes: readonly SubaruCancelCodeSpec[];
  customizeItems: readonly SubaruCustomizeOptionSpec[];
  signals: readonly Ssm4SignalDef[];
}

/**
 * Functions explicitly handled in the dedicated `/tools/subaru-coding` service.
 * Must NEVER be rendered inside `Combination Meter`, `EyeSight`, or `Immobilizer` Work Support / Customize.
 */
export const EXCLUDED_SUBARU_CODING_WORK_IDS = new Set<string>([
  // Meter variant & 12-column configuration (in /tools/subaru-coding)
  "met-read-control-setting",
  "met-write-control-setting",
  "met-ecu-config-rw",
  "meter-read-variant",
  // EyeSight variant parameter selection / confirm (in /tools/subaru-coding)
  "es-selection-of-parameter",
  "es-confirm-on-parameter",
  "eyesight-camera-check",
  // Immobilizer / Smart Key registration / RES CM / Telematics CM (in /tools/subaru-coding?tab=immo)
  "immo-key-registration",
  "immo-key-deletion",
  "immo-steering-lock-reg",
  "immo-ecm-reg",
  "immo-res-cm-reg",
  "immo-tlm-cm-reg",
  "immo-key-count-check",
]);

const VIN_YEAR_MAP: Record<string, number> = {
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
  V: 2027,
};

export function decodeSubaruVinInfo(rawVin: string | null | undefined): SubaruVinDecodedInfo | null {
  if (!rawVin) return null;
  const vin = rawVin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vin.length < 5) return null;
  const yearChar = vin.length >= 10 ? vin[9]! : "";
  const modelYear = VIN_YEAR_MAP[yearChar] ?? null;
  const plantCountry =
    vin.startsWith("JF1") || vin.startsWith("JF2")
      ? "Япония (Gunma)"
      : vin.startsWith("4S3") || vin.startsWith("4S4")
        ? "США (SIA Lafayette)"
        : "Неизвестно";
  const chassisHint = vin.length >= 5 ? vin.slice(3, 5) : null;
  const vehicle = matchSsm4VehicleByVin(vin);
  return {
    vin,
    modelYear,
    plantCountry,
    chassisHint,
    vehicle,
  };
}

/**
 * Unique physical CAN targets polled during Subaru "Scan All Faults" (`Все ошибки`).
 * Ordered logically by vehicle domain; UI re-sorts dynamically after scan:
 * Current DTCs -> History DTCs -> No DTC -> Not Detected.
 */
export const SUBARU_ALL_DTC_TARGETS: readonly (ModuleDtcTarget & {
  abbr: string;
  nameEn: string;
  group: Ssm4Group;
  primarySystemId: string;
})[] = [
  {
    tx: 0x7e0,
    rx: 0x7e8,
    abbr: "EGI",
    nameEn: "Engine",
    title: "Engine · Двигатель (EGI · 7E0 → 7E8)",
    group: "Powertrain",
    primarySystemId: "sys-egi",
    safetyCritical: false,
    canSafeClear: true,
    mode03Fallback: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7e1,
    rx: 0x7e9,
    abbr: "TM",
    nameEn: "Transmission",
    title: "Transmission · Вариатор Lineartronic (TM · 7E1 → 7E9)",
    group: "Powertrain",
    primarySystemId: "sys-tm",
    safetyCritical: false,
    canSafeClear: true,
    mode03Fallback: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7a3,
    rx: 0x7ab,
    abbr: "TM2",
    nameEn: "Transmission SGP #2",
    title: "Transmission SGP #2 · Вариатор (7A3 → 7AB)",
    group: "Powertrain",
    primarySystemId: "sys-tm",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7a2,
    rx: 0x7aa,
    abbr: "PTM",
    nameEn: "Powertrain Thermal / Hybrid",
    title: "Силовая установка / термоконтур SGP (7A2 → 7AA)",
    group: "Powertrain",
    primarySystemId: "sys-egi",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7b0,
    rx: 0x7b8,
    abbr: "BC",
    nameEn: "Brake Control (ABS / VDC / EPB / EBB)",
    title: "Brake Control · ABS / VDC / EPB / EBB (7B0 → 7B8)",
    group: "Chassis",
    primarySystemId: "sys-bc",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x746,
    rx: 0x74e,
    abbr: "PS",
    nameEn: "Power Steering / SAS",
    title: "Power Steering / SAS · Электроусилитель руля (746 → 74E)",
    group: "Chassis",
    primarySystemId: "sys-ps",
    safetyCritical: true,
    canSafeClear: false,
    mitsubishiKwp: false,
  },
  {
    tx: 0x787,
    rx: 0x78f,
    abbr: "ES",
    nameEn: "EyeSight / Cameras / Radars",
    title: "EyeSight · Стереокамера и ассистенты ADAS (787 → 78F)",
    group: "Chassis",
    primarySystemId: "sys-es",
    safetyCritical: true,
    canSafeClear: false,
    mitsubishiKwp: false,
  },
  {
    tx: 0x752,
    rx: 0x75a,
    abbr: "BIU",
    nameEn: "Body Control / TPMS / Seat / PRG",
    title: "Body Control · Кузов, TPMS, двери, сиденья (BIU · 752 → 75A)",
    group: "Body",
    primarySystemId: "sys-biu",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x783,
    rx: 0x78b,
    abbr: "MET",
    nameEn: "Combination Meter / Cockpit",
    title: "Combination Meter · Приборная панель / CCU (783 → 78B)",
    group: "Body",
    primarySystemId: "sys-met",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7c4,
    rx: 0x7cc,
    abbr: "AC",
    nameEn: "Air Conditioner",
    title: "Air Conditioner · Климат-контроль Auto A/C (7C4 → 7CC)",
    group: "Body",
    primarySystemId: "sys-ac",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x780,
    rx: 0x788,
    abbr: "AB",
    nameEn: "Airbag SRS",
    title: "Airbag · Подушки безопасности SRS (780 → 788)",
    group: "Body",
    primarySystemId: "sys-ab",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x786,
    rx: 0x78e,
    abbr: "RAB",
    nameEn: "Reverse Automatic Braking",
    title: "RAB · Задние сонары и автоторможение (786 → 78E)",
    group: "Body",
    primarySystemId: "sys-rab",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x750,
    rx: 0x758,
    abbr: "CGTW",
    nameEn: "Central Gateway / Keyless",
    title: "Central Gateway / Keyless · Шлюз и доступ (750 → 758)",
    group: "Body",
    primarySystemId: "sys-cgtw",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x7b4,
    rx: 0x7bc,
    abbr: "KEY",
    nameEn: "Keyless Access SGP (H-Type)",
    title: "Smart Key SGP · Бесключевой старт H-Type (7B4 → 7BC)",
    group: "Body",
    primarySystemId: "sys-smtc",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x751,
    rx: 0x759,
    abbr: "KEY-D",
    nameEn: "Keyless Access (D-Type)",
    title: "Keyless Access · Бесключевой доступ D-Type (751 → 759)",
    group: "Body",
    primarySystemId: "sys-smtc",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x74c,
    rx: 0x754,
    abbr: "LT",
    nameEn: "Headlight / SRH / ADB",
    title: "Headlight · Поворотные фары SRH / ADB (74C → 754)",
    group: "Body",
    primarySystemId: "sys-lt",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x763,
    rx: 0x76b,
    abbr: "DMN",
    nameEn: "Driver Monitor (DriverFocus)",
    title: "Driver Monitor · Камера DriverFocus (763 → 76B)",
    group: "Body",
    primarySystemId: "sys-dmn",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
  {
    tx: 0x765,
    rx: 0x76d,
    abbr: "TLM",
    nameEn: "Telematics (Starlink / DCM)",
    title: "Telematics · Блок телематики DCM / eCall (765 → 76D)",
    group: "Body",
    primarySystemId: "sys-tlm",
    safetyCritical: false,
    canSafeClear: true,
    mitsubishiKwp: false,
  },
];

/**
 * Classifies a DTC as `current` vs `history` matching SSM4 ("Current" vs "History").
 * Per ISO 14229: bit 0 (`0x01`, `testFailed`) indicates a current fault; confirmed without `testFailed` (`0x08` / `0x28`) is `history`.
 */
export function classifySubaruDtcStatus(dtc: ModuleDtcItem): SubaruDtcSeverity {
  if (typeof dtc.statusByte === "number") {
    return (dtc.statusByte & 0x01) !== 0 ? "current" : "history";
  }
  return dtc.active ? "current" : "history";
}

export function getSubaruBlockScanStatus(report: ModuleDtcReport | undefined): SubaruBlockScanStatus {
  if (!report) return "unscanned";
  if (!report.responded) return "not_detected";
  if (report.dtcs.length === 0) return "no_dtc";
  const hasCurrent = report.dtcs.some((d) => classifySubaruDtcStatus(d) === "current");
  return hasCurrent ? "current" : "history";
}

const STATUS_SORT_RANK: Record<SubaruBlockScanStatus, number> = {
  current: 0,
  history: 1,
  no_dtc: 2,
  unscanned: 3,
  not_detected: 4,
};

/**
 * Mandatory sort order matching SSM4 / Mitsubishi Diagnostics:
 * 1) Current DTCs (top)
 * 2) History DTCs
 * 3) No DTC (responded, 0 faults)
 * 4) Unscanned
 * 5) Not detected / no response (bottom)
 */
export function sortSubaruScanReports<T extends { report?: ModuleDtcReport }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const sa = getSubaruBlockScanStatus(a.report);
    const sb = getSubaruBlockScanStatus(b.report);
    const rankDiff = STATUS_SORT_RANK[sa] - STATUS_SORT_RANK[sb];
    if (rankDiff !== 0) return rankDiff;
    const dtcDiff = (b.report?.dtcs.length ?? 0) - (a.report?.dtcs.length ?? 0);
    return dtcDiff;
  });
}

// ---------------------------------------------------------------------------
// SSM4 Active Test Catalog (per block, matching SSM4 F4 Active Test screens)
// ---------------------------------------------------------------------------
const ACTIVE_TESTS_BY_TX: Record<string, readonly SubaruActiveTestItem[]> = {
  "7E0": [
    {
      id: "egi-act-fuel-pump",
      nameEn: "Fuel Pump Relay",
      nameRu: "Реле топливного насоса (Fuel Pump Relay)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Принудительное включение/контроль реле и скважности топливного насоса низкого давления. Используется для проверки питания и давления в рампе.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен (0 об/мин)", "Селектор в P/N"],
      risk: "actuator",
      onPayloads: ["2F11DE0301", "2F10B303FF"],
      offPayloads: ["2F11DE0300", "2F10B300"],
      monitorDids: [
        { didHex: "10B3", labelRu: "Скважность топливного насоса (%)" },
        { didHex: "111E", labelRu: "Целевое давление ТНВД (MPa)" },
        { didHex: "F423", labelRu: "Давление в топливной рампе (kPa)" },
      ],
    },
    {
      id: "egi-act-cpc",
      nameEn: "CPC Solenoid Valve",
      nameRu: "Клапан продувки адсорбера CPC (CPC Solenoid Valve)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Принудительная активация электромагнитного клапана продувки адсорбера паров топлива EVAP для проверки щелчка и герметичности.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен или ХХ"],
      risk: "actuator",
      onPayloads: ["2F10AE03FF"],
      offPayloads: ["2F10AE00"],
      monitorDids: [{ didHex: "10AE", labelRu: "Скважность клапана CPC (%)" }],
    },
    {
      id: "egi-act-radiator-fan",
      nameEn: "Radiator Fan",
      nameRu: "Вентилятор охлаждения радиатора (Radiator Fan)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Принудительное включение вентиляторов системы охлаждения ДВС (низкая / высокая скорость) и контроль температуры ОЖ.",
      conditionsRu: ["Зажигание IG ON", "Руки и одежда вне зоны крыльчатки вентиляторов"],
      risk: "actuator",
      onPayloads: ["2F10AB03FF", "2F11DC0301"],
      offPayloads: ["2F10AB00", "2F11DC0300"],
      monitorDids: [
        { didHex: "10AB", labelRu: "Управление вентилятором (%)" },
        { didHex: "13EC", labelRu: "Температура ОЖ в блоке ДВС (°C)" },
        { didHex: "F405", labelRu: "Температура ОЖ OBD (°C)" },
      ],
    },
    {
      id: "egi-act-ac-comp",
      nameEn: "A/C Compressor",
      nameRu: "Муфта компрессора кондиционера (A/C Compressor)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Тестовое включение запроса муфты кондиционера от ЭБУ двигателя (ECM) с контролем оборотов холостого хода и напряжения.",
      conditionsRu: ["Двигатель работает на ХХ", "Селектор в P"],
      risk: "actuator",
      onPayloads: ["2F11DA0301"],
      offPayloads: ["2F11DA0300"],
      monitorDids: [
        { didHex: "F40C", labelRu: "Обороты двигателя (RPM)" },
        { didHex: "F442", labelRu: "Напряжение питания ECM (V)" },
      ],
    },
    {
      id: "egi-act-wastegate",
      nameEn: "Turbocharger Wastegate Actuator",
      nameRu: "Электронный актуатор вестгейта турбины (Wastegate · PU-072.srp)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Принудительный ход штока электронного вестгейта EWG (FA20F / FA24F / CB18) для проверки заедания и калибровки крайних положений.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен", "Остывший выпуск при проверке вручную"],
      risk: "actuator",
      onPayloads: ["2F162103FF"],
      offPayloads: ["2F16210300"],
      monitorDids: [
        { didHex: "10D2", labelRu: "Обученное положение EWG" },
        { didHex: "10D3", labelRu: "Целевой ход штока EWG (мм)" },
        { didHex: "10D4", labelRu: "Фактический ход штока EWG (мм)" },
      ],
    },
    {
      id: "egi-act-elcm",
      nameEn: "ELCM Switching Valve & Vacuum Pump",
      nameRu: "Модуль герметичности EVAP ELCM (клапан и вакуумный насос)",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Активация переключающего клапана и вакуумного насоса диагностики утечек паров бензина (US/Canada EVAP ELCM).",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен", "Пробка бензобака закрыта"],
      risk: "actuator",
      onPayloads: ["2F12720301", "2F12730301"],
      offPayloads: ["2F12720300", "2F12730300"],
      monitorDids: [
        { didHex: "1272", labelRu: "Переключающий клапан ELCM" },
        { didHex: "1273", labelRu: "Вакуумный насос ELCM" },
      ],
    },
  ],
  "7E1": [
    {
      id: "tm-act-fr-clutch",
      nameEn: "F&R Clutch Solenoid",
      nameRu: "Линейный соленоид сцепления F&R (Forward & Reverse)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Проверка электрической цепи и отклика тока линейного соленоида переднего/заднего хода вариатора Lineartronic.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "1144", labelRu: "Целевой ток F&R (mA)" },
        { didHex: "1145", labelRu: "Фактический ток F&R (mA)" },
        { didHex: "1017", labelRu: "Температура CVTF (°C)" },
      ],
    },
    {
      id: "tm-act-secondary",
      nameEn: "Secondary Solenoid",
      nameRu: "Соленоид вторичного шкива (Secondary Solenoid)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Контроль целевого и фактического тока, а также давления во вторичном контуре вариатора.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "113B", labelRu: "Целевой ток Secondary (mA)" },
        { didHex: "113C", labelRu: "Фактический ток Secondary (mA)" },
        { didHex: "113A", labelRu: "Фактическое вторичное давление (MPa)" },
      ],
    },
    {
      id: "tm-act-primary",
      nameEn: "Primary Up / Down Solenoid",
      nameRu: "Соленоиды первичного шкива (Primary Up / Down)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Проверка скважности управляющих соленоидов Primary UP и Primary DOWN, регулирующих передаточное отношение CVT.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "1142", labelRu: "Скважность Primary UP (%)" },
        { didHex: "1143", labelRu: "Скважность Primary DOWN (%)" },
        { didHex: "1141", labelRu: "Фактическое первичное давление (MPa)" },
      ],
    },
    {
      id: "tm-act-lockup",
      nameEn: "Lock-Up Duty Solenoid",
      nameRu: "Соленоид блокировки ГДТ (Lock-Up Duty Solenoid)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Контроль работы соленоида блокировки гидротрансформатора (L/U) и статуса муфты блокировки.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "10C8", labelRu: "Скважность L/U (%)" },
        { didHex: "119F", labelRu: "Статус блокировки ГДТ" },
      ],
    },
    {
      id: "tm-act-line",
      nameEn: "Line Solenoid",
      nameRu: "Соленоид линейного давления (Line Solenoid)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Контроль цепи линейного соленоида и основного магистрального давления масла CVT.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "12B2", labelRu: "Целевой ток Line (mA)" },
        { didHex: "12B3", labelRu: "Фактический ток Line (mA)" },
        { didHex: "12B1", labelRu: "Фактическое давление Line (MPa)" },
      ],
    },
    {
      id: "tm-act-awd",
      nameEn: "AWD Linear Solenoid",
      nameRu: "Соленоид муфты полного привода (AWD Linear Solenoid)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Проверка соленоида управления распределением момента на заднюю ось (MPT AWD).",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [
        { didHex: "12B4", labelRu: "Целевой ток AWD (mA)" },
        { didHex: "12B5", labelRu: "Фактический ток AWD (mA)" },
        { didHex: "10C9", labelRu: "Скважность 4WD (%)" },
      ],
    },
    {
      id: "tm-act-eop",
      nameEn: "Electric Oil Pump (EOP) Control",
      nameRu: "Электронасос вариатора Start-Stop (Electric Oil Pump Control)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Контроль реле, целевых/фактических оборотов и тока электрического маслонасоса EOP (для комплектаций с Auto Start-Stop).",
      conditionsRu: ["Зажигание IG ON", "Селектор в P", "Температура масла в норме"],
      risk: "actuator",
      monitorDids: [
        { didHex: "126C", labelRu: "Статус электронасоса EOP" },
        { didHex: "12E3", labelRu: "Целевые обороты EOP (RPM)" },
        { didHex: "12E4", labelRu: "Фактические обороты EOP (RPM)" },
        { didHex: "12E5", labelRu: "Ток электронасоса EOP (A)" },
      ],
    },
  ],
  "7B0": [
    {
      id: "bc-act-forced-boost",
      nameEn: "Forced Boost 1 / 2 / 3 of VDC",
      nameRu: "Принудительная накачка давления VDC (Forced Boost 1/2/3)",
      txHex: "7B0",
      rxHex: "7B8",
      explanationRu:
        "Проверка работы электронасоса и клапанов модулятора гидроблока ABS/VDC/EBB с контролем давления тормозной жидкости в контурах.",
      conditionsRu: ["Автомобиль неподвижен", "Селектор в P", "Нога на педали тормоза (см. подсказки)"],
      risk: "actuator",
      monitorDids: [
        { didHex: "1001", labelRu: "Давление главного тормозного цилиндра" },
        { didHex: "28C4", labelRu: "Давление переднего правого контура FR" },
        { didHex: "28C5", labelRu: "Давление переднего левого контура FL" },
      ],
    },
  ],
  "752": [
    {
      id: "biu-act-lock",
      nameEn: "Lock actuator LOCK output",
      nameRu: "Привод замков дверей — ЗАКРЫТЬ (LOCK output)",
      txHex: "752",
      rxHex: "75A",
      explanationRu:
        "Принудительная подача команды запирания всех дверных актуаторов через блок управления кузовом BIU.",
      conditionsRu: ["Зажигание IG ON", "Двери закрыты или защёлкнуты", "Ключ не оставлять внутри"],
      risk: "actuator",
      onPayloads: ["2F107A0301"],
      offPayloads: ["2F107A00"],
      monitorDids: [{ didHex: "107A", labelRu: "Статус концевиков и замков дверей" }],
    },
    {
      id: "biu-act-unlock",
      nameEn: "All seat UNLOCK output",
      nameRu: "Привод замков дверей — ОТКРЫТЬ ВСЕ (UNLOCK output)",
      txHex: "752",
      rxHex: "75A",
      explanationRu: "Принудительное отпирание всех замков дверей для проверки проводки и актуаторов.",
      conditionsRu: ["Зажигание IG ON"],
      risk: "actuator",
      onPayloads: ["2F107A0302"],
      offPayloads: ["2F107A00"],
      monitorDids: [{ didHex: "107A", labelRu: "Статус концевиков дверей" }],
    },
    {
      id: "biu-act-trunk",
      nameEn: "R gate/trunk UNLOCK output",
      nameRu: "Замок крышки багажника / 5-й двери (Trunk UNLOCK output)",
      txHex: "752",
      rxHex: "75A",
      explanationRu: "Тестовый импульс на соленоид отпирания крышки багажника или пятой двери.",
      conditionsRu: ["Зажигание IG ON", "Пространство за крышкой багажника свободно"],
      risk: "actuator",
      monitorDids: [{ didHex: "107A", labelRu: "Статус концевика багажника и дверей" }],
    },
    {
      id: "biu-act-shift-lock",
      nameEn: "Shift lock solenoid output",
      nameRu: "Соленоид блокировки селектора КПП (Shift lock solenoid)",
      txHex: "752",
      rxHex: "75A",
      explanationRu: "Проверка срабатывания блокировки селектора АКПП/CVT при нажатии тормоза.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      risk: "actuator",
      monitorDids: [{ didHex: "101B", labelRu: "Напряжение питания BIU" }],
    },
    {
      id: "biu-act-horn",
      nameEn: "Horn Output",
      nameRu: "Звуковой сигнал (Horn Output)",
      txHex: "752",
      rxHex: "75A",
      explanationRu: "Кратковременное включение реле звукового сигнала для проверки цепи от BIU.",
      conditionsRu: ["Зажигание IG ON"],
      risk: "actuator",
      monitorDids: [{ didHex: "101B", labelRu: "Напряжение питания BIU" }],
    },
    {
      id: "biu-act-mirror-ind",
      nameEn: "Door mirror indicator active test",
      nameRu: "Повторители/индикаторы в боковых зеркалах (Mirror indicator)",
      txHex: "752",
      rxHex: "75A",
      explanationRu: "Проверка ламп поворотников и индикаторов слепых зон в наружных зеркалах заднего вида.",
      conditionsRu: ["Зажигание IG ON"],
      risk: "actuator",
      monitorDids: [{ didHex: "1061", labelRu: "Выход освещения LH" }],
    },
  ],
  "783": [
    {
      id: "met-act-gauges",
      nameEn: "Speedometer / Tachometer / Fuel & Temp Gauge Sweep",
      nameRu: "Тест стрелок, дисплея, контрольных ламп и зуммера приборки",
      txHex: "783",
      rxHex: "78B",
      explanationRu:
        "Проверка индикации комбинации приборов (подсветка, датчики полубаков, питание). Внимание: конфигурация региона в отдельном сервисе.",
      conditionsRu: ["Зажигание IG ON", "Автомобиль неподвижен"],
      risk: "safe",
      monitorDids: [
        { didHex: "101B", labelRu: "Напряжение питания приборки" },
        { didHex: "1062", labelRu: "Яркость подсветки (Dimmer)" },
        { didHex: "1041", labelRu: "Датчик топлива основной (LH)" },
        { didHex: "1042", labelRu: "Датчик топлива дополнительный (RH)" },
      ],
    },
  ],
  "7C4": [
    {
      id: "ac-act-blower",
      nameEn: "Blower Fan & Mode/Mix Actuators",
      nameRu: "Тест вентилятора отопителя и заслонок климата",
      txHex: "7C4",
      rxHex: "7CC",
      explanationRu:
        "Контроль текущей скорости мотора печки, положения заслонок смешивания/обдува и электромагнитного клапана компрессора.",
      conditionsRu: ["Зажигание IG ON"],
      risk: "safe",
      monitorDids: [
        { didHex: "123C", labelRu: "Скорость вентилятора Blower" },
        { didHex: "122D", labelRu: "Заслонка смешивания водителя" },
        { didHex: "122E", labelRu: "Заслонка смешивания пассажира" },
        { didHex: "122F", labelRu: "Заслонка направления обдува Mode" },
        { didHex: "1230", labelRu: "Заслонка рециркуляции" },
        { didHex: "1250", labelRu: "Ток соленоида компрессора A/C" },
      ],
    },
  ],
  "74C": [
    {
      id: "lt-act-srh-right",
      nameEn: "Right Steering Responsive Headlight",
      nameRu: "Поворот правой фары SRH (Right Steering Responsive Headlight)",
      txHex: "74C",
      rxHex: "754",
      explanationRu:
        "Проверка привода поворота и корректора правой адаптивной фары SRH / ADB.",
      conditionsRu: ["Зажигание IG ON", "Двигатель запущен, если линза не реагирует (см. SSM4)", "Автомобиль неподвижен"],
      risk: "actuator",
      onPayloads: ["31010201"],
      monitorDids: [
        { didHex: "10A1", labelRu: "Статус датчика/привода фар 10A1" },
        { didHex: "10A2", labelRu: "Статус датчика/привода фар 10A2" },
      ],
    },
    {
      id: "lt-act-srh-left",
      nameEn: "Left Steering Responsive Headlight",
      nameRu: "Поворот левой фары SRH (Left Steering Responsive Headlight)",
      txHex: "74C",
      rxHex: "754",
      explanationRu:
        "Проверка привода поворота и корректора левой адаптивной фары SRH / ADB.",
      conditionsRu: ["Зажигание IG ON", "Двигатель запущен при необходимости", "Автомобиль неподвижен"],
      risk: "actuator",
      onPayloads: ["31010202"],
      monitorDids: [
        { didHex: "10A1", labelRu: "Статус датчика/привода фар 10A1" },
        { didHex: "10A2", labelRu: "Статус датчика/привода фар 10A2" },
      ],
    },
  ],
  "786": [
    {
      id: "rab-act-buzzer",
      nameEn: "RAB Buzzer & Sonar Output",
      nameRu: "Зуммер и индикация задних сонаров RAB (RAB-003.srp)",
      txHex: "786",
      rxHex: "78E",
      explanationRu:
        "Принудительная проверка зуммера предупреждения о препятствии сзади и считывание показаний 4 датчиков бампера.",
      conditionsRu: ["Зажигание IG ON", "Датчики бампера чистые"],
      risk: "actuator",
      onPayloads: ["2F10340301"],
      offPayloads: ["2F103400"],
      monitorDids: [
        { didHex: "10A7", labelRu: "Дистанция / статус сонара RL" },
        { didHex: "10A8", labelRu: "Дистанция / статус сонара RCL" },
        { didHex: "10A9", labelRu: "Дистанция / статус сонара RCR" },
        { didHex: "10AA", labelRu: "Дистанция / статус сонара RR" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// SSM4 Work Support Catalog (strictly excluding Meter/EyeSight/Immo service items!)
// ---------------------------------------------------------------------------
const WORK_SUPPORT_BY_SYSTEM_ID: Record<string, readonly SubaruWorkSupportItem[]> = {
  "sys-egi": [
    {
      id: "egi-simple-roughness",
      nameEn: "Simple Roughness Monitor",
      nameRu: "Простой монитор пропусков зажигания по цилиндрам",
      txHex: "7E0",
      rxHex: "7E8",
      category: "inspection",
      srpRef: "EGI Work Support",
      explanationRu:
        "Считывает счётчики неравномерности вращения коленвала по каждому цилиндру (#1–#4/#6) в реальном времени для поиска пропусков зажигания.",
      conditionsRu: ["Двигатель прогрет и работает на холостом ходу", "Селектор в P/N"],
      payloads: ["22110B", "22110C", "22110D", "22110E", "22110F", "221110"],
      liveDids: [
        { didHex: "110B", labelRu: "Цилиндр #1" },
        { didHex: "110C", labelRu: "Цилиндр #2" },
        { didHex: "110D", labelRu: "Цилиндр #3" },
        { didHex: "110E", labelRu: "Цилиндр #4" },
      ],
    },
    {
      id: "egi-high-grade-roughness",
      nameEn: "High Grade Roughness Monitor (pre-misfire detection)",
      nameRu: "Расширенный монитор неравномерности по цилиндрам (High Grade)",
      txHex: "7E0",
      rxHex: "7E8",
      category: "inspection",
      srpRef: "EGI Work Support",
      explanationRu:
        "Высокочувствительный счётчик микро-пропусков до появления чек-энжина P030x (DID 2021..2027).",
      conditionsRu: ["Двигатель работает на ХХ или под лёгкой нагрузкой"],
      payloads: ["222021", "222022", "222023", "222024", "222025", "222026", "222027"],
      liveDids: [
        { didHex: "2021", labelRu: "Монитор цилиндра #1" },
        { didHex: "2022", labelRu: "Монитор цилиндра #2" },
        { didHex: "2023", labelRu: "Монитор цилиндра #3" },
        { didHex: "2024", labelRu: "Монитор цилиндра #4" },
      ],
    },
    {
      id: "egi-clear-memory-2",
      nameEn: "Clear Memory 2 (Fuel / Throttle / IAM Reset)",
      nameRu: "Сброс адаптаций ДВС и дросселя (Clear Memory 2)",
      txHex: "7E0",
      rxHex: "7E8",
      category: "reset",
      srpRef: "PU-044 / PU-077 / APS-001.srp",
      explanationRu:
        "Сбрасывает долгосрочные топливные коррекции (LTFT), обучение дроссельной заслонки ETCS и коэффициент детонации IAM после чистки дросселя или ремонта.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен", "Педаль газа отпущена"],
      serviceActionId: "ecm-Clear-learned",
      confirmRequired: true,
    },
    {
      id: "egi-avcs-ewg-learning",
      nameEn: "Save AVCS Learning & EWG Inspection",
      nameRu: "Обучение фазовращателей AVCS и электронного вестгейта EWG",
      txHex: "7E0",
      rxHex: "7E8",
      category: "learning",
      srpRef: "PU-063 / PU-072 / PU-073.srp",
      explanationRu:
        "Опрашивает обученные углы AVCS (впуск/выпуск), положение штока электронного вестгейта (10D2..10D4) и запускает рутины сохранения обучения.",
      conditionsRu: ["Двигатель прогрет (> 75 °C)", "Селектор в P"],
      serviceActionId: "ecm-avcs-learning",
      confirmRequired: true,
    },
    {
      id: "egi-injector-pump",
      nameEn: "Injector Compensation Codes & HPFP Check",
      nameRu: "Коды форсунок и обучение ТНВД",
      txHex: "7E0",
      rxHex: "7E8",
      category: "inspection",
      srpRef: "PU-030..041.srp",
      explanationRu:
        "Считывает калибровочные коды форсунок прямого впрыска / дизеля и параметры обучения топливного насоса высокого давления.",
      conditionsRu: ["Зажигание IG ON"],
      serviceActionId: "ecm-injector-check",
    },
    {
      id: "egi-gpf-dpf",
      nameEn: "GPF / DPF Inspection & Service Reset",
      nameRu: "Инспекция и сервисные рутины сажевого фильтра GPF / DPF",
      txHex: "7E0",
      rxHex: "7E8",
      category: "inspection",
      srpRef: "PU-042 / PU-067 / PU-076 / PU-078.srp",
      explanationRu:
        "Считывает заполнение фильтра GPF/DPF и запускает сервисный сброс после замены или регенерации.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен"],
      serviceActionId: "ecm-dpf-gpf-reset",
      confirmRequired: true,
    },
    {
      id: "egi-iss-battery-reset",
      nameEn: "Auto Start-Stop Battery Adaptation Reset",
      nameRu: "Сброс адаптации АКБ Auto Start-Stop после замены",
      txHex: "7E0",
      rxHex: "7E8",
      category: "reset",
      srpRef: "ISS-001..009.srp",
      explanationRu:
        "Сбрасывает историю старения и ёмкости аккумулятора EFB/AGM в системе Start-Stop (DID 10F8/14E0 + 31 01 20 00).",
      conditionsRu: ["Новый или полностью заряженный АКБ", "Зажигание IG ON", "Двигатель заглушен"],
      serviceActionId: "iss-battery-reset",
      confirmRequired: true,
    },
    {
      id: "egi-entry-vin",
      nameEn: "Check / Read Entry VIN",
      nameRu: "Чтение VIN, записанного в ЭБУ двигателя (Entry VIN)",
      txHex: "7E0",
      rxHex: "7E8",
      category: "read",
      srpRef: "PU-029.srp",
      explanationRu: "Проверяет VIN, записанный в памяти ECM (OBD Mode 09 PID 02 и UDS 22 F190).",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["0902", "22F190"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-tm": [
    {
      id: "tm-clear-at-learning",
      nameEn: "Clear AT learning value",
      nameRu: "Сброс таблицы адаптации вариатора (Clear AT learning value)",
      txHex: "7E1",
      rxHex: "7E9",
      category: "reset",
      srpRef: "PU-027 / PU-028 / PU-044 / PU-077.srp",
      explanationRu:
        "Очищает накопленные адаптации давлений и сцепления F&R в TCM. Обязательно после ремонта гидроблока, замены масла с переобучением или замены соленоидов.",
      conditionsRu: ["Селектор в P", "Зажигание IG ON, двигатель заглушен", "Стояночный тормоз затянут"],
      serviceActionId: "tcm-at-learning-clear",
      confirmRequired: true,
    },
    {
      id: "tm-at-learning-mode",
      nameEn: "AT learning mode",
      nameRu: "Режим обучения вариатора (AT learning mode)",
      txHex: "7E1",
      rxHex: "7E9",
      category: "learning",
      srpRef: "PU-034..038.srp",
      explanationRu:
        "Запускает штатную калибровку точек схватывания, линейного давления и нейтрали вариатора Lineartronic.",
      conditionsRu: [
        "Температура жидкости CVTF строго 65–85 °C (проконтролируйте ниже!)",
        "Педаль тормоза нажата до упора",
        "Руль прямо, климат и фары выключены",
      ],
      serviceActionId: "tcm-at-learning-start",
      liveDids: [
        { didHex: "1017", labelRu: "Температура CVTF (1017)" },
        { didHex: "10D2", labelRu: "Температура CVTF (10D2)" },
        { didHex: "1243", labelRu: "Статус обучения AT Learning" },
      ],
      confirmRequired: true,
    },
    {
      id: "tm-rear-diff-inspection",
      nameEn: "Rear differential inspection mode",
      nameRu: "Режим инспекции заднего дифференциала",
      txHex: "7E1",
      rxHex: "7E9",
      category: "inspection",
      srpRef: "PU-034..038 / Rear Diff Mode",
      explanationRu:
        "Переводит муфту полного привода в сервисный режим для проверки заднего дифференциала или динамометрического стенда.",
      conditionsRu: ["Автомобиль на подъёмнике или на ровной площадке", "Селектор в P", "Зажигание IG ON"],
      payloads: ["2212B8", "31017002", "31017003"],
      liveDids: [
        { didHex: "12B8", labelRu: "Режим полного привода AWD" },
        { didHex: "10C9", labelRu: "Скважность муфты 4WD (%)" },
      ],
      confirmRequired: true,
    },
    {
      id: "tm-awd-switching",
      nameEn: "AWD ON/OFF switching mode",
      nameRu: "Инспекция и переключение режима AWD ON/OFF",
      txHex: "7E1",
      rxHex: "7E9",
      category: "inspection",
      srpRef: "TCM AWD Inspection",
      explanationRu:
        "Считывает режим управления муфтой полного привода (AWD Mode), заданный и фактический ток соленоида муфты.",
      conditionsRu: ["Зажигание IG ON", "Селектор в P"],
      payloads: ["2212B8", "2210C9", "2212B4", "2212B5"],
      stopOnWriteSuccess: false,
      liveDids: [
        { didHex: "12B8", labelRu: "Режим AWD" },
        { didHex: "12B4", labelRu: "Целевой ток AWD" },
        { didHex: "12B5", labelRu: "Фактический ток AWD" },
      ],
    },
    {
      id: "tm-start-count",
      nameEn: "Start count reading (ECU to SSM) & EOP Check",
      nameRu: "Чтение счётчика пусков Start-Stop и инспекция EOP",
      txHex: "7E1",
      rxHex: "7E9",
      category: "read",
      srpRef: "ISS / EOP Work Support",
      explanationRu:
        "Считывает счётчик циклов старт-стоп, параметры АКБ Start-Stop (SOC, напряжение, сопротивление) и статус электромаслонасоса EOP.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22146F", "221470", "221472", "221473", "22126C", "2212E4", "2212E5"],
      stopOnWriteSuccess: false,
      liveDids: [
        { didHex: "1472", labelRu: "Заряд АКБ SOC (%)" },
        { didHex: "126C", labelRu: "Статус EOP" },
      ],
    },
  ],
  "sys-bc": [
    {
      id: "bc-vdc-midpoint",
      nameEn: "VDC Sensor Midpoint Setting Mode",
      nameRu: "Калибровка нуля датчика угла руля и G-сенсора (VDC Midpoint)",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "ABS-001..004 / ABS-034..036.srp",
      explanationRu:
        "Обучает нулевую точку датчика угла рулевого колеса (SAS), датчика рыскания и продольного/поперечного ускорения в блоке ABS/VDC.",
      conditionsRu: [
        "Автомобиль на ровной горизонтальной площадке",
        "Руль и передние колёса выставлены строго прямо (0.0°)",
        "Селектор в P, двигатель работает на ХХ или IG ON",
      ],
      serviceActionId: "vdc-steering-zero",
      confirmRequired: true,
    },
    {
      id: "bc-epb-release",
      nameEn: "Brake Maintenance Mode — Release (Pad Exchange)",
      nameRu: "Разведение задних колодок электроручника EPB (сервисный режим)",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "ABS-010 / ABS-032 / ABS-038 / ABS-039.srp",
      explanationRu:
        "Отводит электромоторы задних суппортов EPB в сервисное положение для безопасной замены задних тормозных колодок и дисков.",
      conditionsRu: [
        "Колёса зафиксированы противооткатными упорами!",
        "Селектор в P, педаль тормоза отпущена",
        "Зажигание IG ON",
      ],
      serviceActionId: "epb-pad-release",
      confirmRequired: true,
    },
    {
      id: "bc-epb-return",
      nameEn: "Brake Maintenance Mode — Return (Finish Replacement)",
      nameRu: "Сведение задних колодок электроручника EPB (выход из сервиса)",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "ABS-010 / ABS-032 / ABS-038 / ABS-039.srp",
      explanationRu:
        "Возвращает поршни задних суппортов EPB в рабочее положение после установки новых колодок.",
      conditionsRu: ["Новые колодки и суппорты полностью собраны", "Зажигание IG ON"],
      serviceActionId: "epb-pad-return",
      confirmRequired: true,
    },
    {
      id: "bc-epb-stroke-cal",
      nameEn: "EPB Stroke / Force Calibration",
      nameRu: "Калибровка хода и усилия затяжки электроручника EPB",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "ABS-033 / ABS-040..045.srp",
      explanationRu: "Выполняет цикл адаптации хода привода и усилия прижатия колодок EPB.",
      conditionsRu: ["Колодки сведены, нажмите тормоз 2–3 раза перед калибровкой"],
      serviceActionId: "epb-stroke-cal",
      confirmRequired: true,
    },
    {
      id: "bc-ebb-air-bleeding",
      nameEn: "Air Bleeding Mode / EBB Hydraulic Bleeding",
      nameRu: "Прокачка тормозной системы ABS / EBB (Air Bleeding Mode)",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "EBB-001..009.srp",
      explanationRu:
        "Открывает клапаны модулятора ABS/VDC/EBB для удаления воздуха из контуров при замене тормозной жидкости или блока EBB.",
      conditionsRu: ["Автомобиль неподвижен, уровень тормозной жидкости в бачке Макс.", "Зажигание IG ON"],
      serviceActionId: "ebb-air-bleeding",
      confirmRequired: true,
    },
  ],
  "sys-ebb": [
    {
      id: "ebb-bleeding-direct",
      nameEn: "EBB Air Bleeding & Hydraulic Check",
      nameRu: "Прокачка контура электробустера тормозов EBB",
      txHex: "7B0",
      rxHex: "7B8",
      category: "calibration",
      srpRef: "EBB-001..009.srp",
      explanationRu: "Выполняет опрос давлений EBB и сервисные рутины прокачки 31 01 04 00 / 04 08 / 04 0F / 04 13.",
      conditionsRu: ["Зажигание IG ON", "Уровень тормозной жидкости проверен"],
      serviceActionId: "ebb-air-bleeding",
      confirmRequired: true,
    },
  ],
  "sys-ps": [
    {
      id: "ps-angle-read",
      nameEn: "Steering Angle Sensor Live Check (1041)",
      nameRu: "Контроль датчика угла поворота руля (DID 1041)",
      txHex: "746",
      rxHex: "74E",
      category: "read",
      srpRef: "EPS-001.srp",
      explanationRu:
        "Считывает текущий угол руля (0.1°), ток электромотора и напряжение ЭУР. Калибровка нуля выполняется в блоке Brake Control (7B0).",
      conditionsRu: ["Зажигание IG ON", "Для калибровки нуля перейдите в Brake Control (BC)"],
      payloads: ["221041", "221006", "221007", "22101B"],
      stopOnWriteSuccess: false,
      liveDids: [{ didHex: "1041", labelRu: "Угол руля (°)" }],
    },
  ],
  "sys-sas": [
    {
      id: "sas-angle-read",
      nameEn: "Steering Angle Live Inspection",
      nameRu: "Инспекция угла поворота руля SAS",
      txHex: "746",
      rxHex: "74E",
      category: "read",
      explanationRu: "Проверяет выходной сигнал датчика SAS перед выставлением нуля в блоке VDC (7B0).",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["221041", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  // EyeSight: STRICTLY excludes `Selection of Parameter` (ADA-031) & `Confirm on Parameter` (ADA-032)!
  "sys-es": [
    {
      id: "es-clear-alk-learning",
      nameEn: "Clear Active Lane Keep System Learning Value",
      nameRu: "Сброс обучения системы удержания в полосе (Active Lane Keep)",
      txHex: "787",
      rxHex: "78F",
      category: "reset",
      srpRef: "ADA-030.srp",
      explanationRu:
        "Очищает накопленные адаптации центрирования в полосе Active Lane Keep System. Выполняется после сход-развала или замены лобового стекла.",
      conditionsRu: [
        "Зажигание IG ON, двигатель заглушен",
        "Селектор в P",
        "Автоматически снимается фильтр CGW и запрашивается SecurityAccess",
      ],
      payloads: ["31012003", "31022003"],
      requireCgwFilterRemove: true,
      confirmRequired: true,
    },
    {
      id: "es-forced-heater-fan",
      nameEn: "Forced Drive of Heater and Fan",
      nameRu: "Принудительная проверка обогрева стекла и вентилятора EyeSight",
      txHex: "787",
      rxHex: "78F",
      category: "inspection",
      srpRef: "ADA-034 / ADA-035 / ADA-036.srp",
      explanationRu:
        "Запускает принудительный тест нагревательного элемента зоны стереокамеры и вентилятора охлаждения корпуса EyeSight.",
      conditionsRu: ["Зажигание IG ON", "Двигатель заглушен"],
      payloads: ["31012004", "31012005", "31012007"],
      requireCgwFilterRemove: true,
      confirmRequired: true,
    },
    {
      id: "es-clear-adjustment",
      nameEn: "Clear adjustment value",
      nameRu: "Сброс калибровочных значений камеры EyeSight (Clear adjustment value)",
      txHex: "787",
      rxHex: "78F",
      category: "reset",
      srpRef: "ADA-040 / ADA-041.srp",
      explanationRu:
        "Сбрасывает сохранённую статическую/динамическую калибровку стереокамеры перед проведением новой калибровки на мишени или дороге.",
      conditionsRu: [
        "ВНИМАНИЕ: после сброса потребуется повторная калибровка камеры!",
        "Зажигание IG ON, двигатель заглушен",
      ],
      payloads: ["31011104", "31011105"],
      requireCgwFilterRemove: true,
      confirmRequired: true,
    },
    {
      id: "es-camera-all-adjustment",
      nameEn: "Camera All Adjustment Mode (Replacement / Removal)",
      nameRu: "Режим общей калибровки и статуса камеры EyeSight",
      txHex: "787",
      rxHex: "78F",
      category: "calibration",
      srpRef: "ADA-004 / ADA-007.srp",
      explanationRu:
        "Опрашивает регистры выравнивания оптических осей, углов тангажа/крена/рыскания и статуса замены камеры (4021 / 4100..4103).",
      conditionsRu: ["Зажигание IG ON", "Лобовое стекло чистое"],
      payloads: ["224021", "224100", "224101", "224102", "224103", "22F18E"],
      stopOnWriteSuccess: false,
      requireCgwFilterRemove: true,
    },
    {
      id: "es-all-init",
      nameEn: "EyeSight All Initialization",
      nameRu: "Полная инициализация EyeSight (All Initialization)",
      txHex: "787",
      rxHex: "78F",
      category: "learning",
      srpRef: "ADA-010 / ADA-011 / ADA-024.srp",
      explanationRu:
        "Запускает общую сервисную инициализацию контроллера EyeSight (без изменения регионального Option Code).",
      conditionsRu: ["Зажигание IG ON, двигатель заглушен", "Селектор в P"],
      payloads: ["31012002", "31011103"],
      requireCgwFilterRemove: true,
      confirmRequired: true,
    },
    {
      id: "es-precrash-history",
      nameEn: "Pre-Crash / AEB Operation History",
      nameRu: "История срабатываний экстренного торможения Pre-Crash / AEB",
      txHex: "787",
      rxHex: "78F",
      category: "read",
      srpRef: "ADA-033.srp",
      explanationRu:
        "Считывает записи об активациях Pre-Crash Braking System (4001..4006 и 43E1..43E3) из памяти EyeSight.",
      conditionsRu: ["Зажигание IG ON"],
      serviceActionId: "eyesight-precrash-history",
    },
  ],
  "sys-fsc": [
    {
      id: "fsc-camera-check",
      nameEn: "Front & Side Camera Adjustment Status",
      nameRu: "Инспекция и калибровка передней / боковой камер (Multi View)",
      txHex: "787",
      rxHex: "78F",
      category: "calibration",
      srpRef: "FSC-001..012.srp",
      explanationRu:
        "Читает статус калибровки передней и боковых камер кругового обзора Multi View Monitor (22 10 60..69).",
      conditionsRu: ["Зажигание IG ON", "Двери и зеркала в штатном положении"],
      payloads: ["221060", "221061", "221068", "221069", "22106D", "22F18E"],
      stopOnWriteSuccess: false,
      requireCgwFilterRemove: true,
    },
  ],
  "sys-fcrr": [
    {
      id: "fcrr-radar-cal",
      nameEn: "Front Corner Radar (RH) Alignment",
      nameRu: "Проверка и калибровка правого углового радара FCRR",
      txHex: "787",
      rxHex: "78F",
      category: "calibration",
      srpRef: "FCR-001..004.srp",
      explanationRu: "Проверяет углы юстировки правого переднего углового радара.",
      conditionsRu: ["Автомобиль на ровной площадке"],
      serviceActionId: "fcr-bsd-radar-cal",
    },
  ],
  "sys-fcrl": [
    {
      id: "fcrl-radar-cal",
      nameEn: "Front Corner Radar (LH) Alignment",
      nameRu: "Проверка и калибровка левого углового радара FCRL",
      txHex: "787",
      rxHex: "78F",
      category: "calibration",
      srpRef: "FCR-001..004.srp",
      explanationRu: "Проверяет углы юстировки левого переднего углового радара.",
      conditionsRu: ["Автомобиль на ровной площадке"],
      serviceActionId: "fcr-bsd-radar-cal",
    },
  ],
  "sys-rvdr": [
    {
      id: "rvdr-check",
      nameEn: "SRVD Rear Radar (RH) Inspection",
      nameRu: "Диагностика правого радара слепых зон BSD/RCTA (RVDR)",
      txHex: "787",
      rxHex: "78F",
      category: "inspection",
      srpRef: "FCR-001..004.srp",
      explanationRu: "Считывает углы отклонения и статус калибровки заднего правого радара SRVD.",
      conditionsRu: ["Задний бампер чистый, без металлических наклеек"],
      serviceActionId: "fcr-bsd-radar-cal",
    },
  ],
  "sys-rvdl": [
    {
      id: "rvdl-check",
      nameEn: "SRVD Rear Radar (LH) Inspection",
      nameRu: "Диагностика левого радара слепых зон BSD/RCTA (RVDL)",
      txHex: "787",
      rxHex: "78F",
      category: "inspection",
      srpRef: "FCR-001..004.srp",
      explanationRu: "Считывает углы отклонения и статус калибровки заднего левого радара SRVD.",
      conditionsRu: ["Задний бампер чистый"],
      serviceActionId: "fcr-bsd-radar-cal",
    },
  ],
  // Meter: STRICTLY excludes Read/Write Control module setting & ECU Configuration (in /tools/subaru-coding)!
  "sys-met": [],
  "sys-ccu": [
    {
      id: "ccu-avn-diag",
      nameEn: "Cockpit / Headunit (AVN CP1) Self-Diagnosis",
      nameRu: "Диагностика мультимедиа и навигации Harman CP1 / AVN",
      txHex: "783",
      rxHex: "78B",
      category: "inspection",
      srpRef: "AVN-001..003.srp",
      explanationRu:
        "Считывает статус антенн GPS/FM/DAB, шины мультимедиа (DID 10C0..10CA) и запускает самопроверку головного устройства.",
      conditionsRu: ["Зажигание IG ON, мультимедиа включена"],
      serviceActionId: "avn-headunit-diag",
    },
  ],
  "sys-biu": [
    {
      id: "biu-lan-check",
      nameEn: "LAN Connection Unit Registration / Bus Status",
      nameRu: "Статус зарегистрированных узлов LAN и счётчика зажигания BIU",
      txHex: "752",
      rxHex: "75A",
      category: "read",
      srpRef: "BIU Work Support",
      explanationRu: "Проверяет питание BIU (101B), счётчик IG (101E) и идентификацию блока кузова.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22101B", "22101E", "22107A", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-tpm": [
    {
      id: "tpm-receiver-check",
      nameEn: "TPMS Receiver & Sensor Pressure Check",
      nameRu: "Опрос приёмника TPMS и давления в 4 колёсах",
      txHex: "752",
      rxHex: "75A",
      category: "inspection",
      srpRef: "TPM-001 / TPM-003.srp",
      explanationRu:
        "Считывает давление по четырём шинам (1021–1024) и запускает сервисную процедуру проверки приёмника (31 01 A0 00).",
      conditionsRu: ["Зажигание IG ON", "Для пробуждения датчиков может потребоваться движение или давление > 150 kPa"],
      serviceActionId: "tpms-read-id-status",
    },
  ],
  "sys-seat": [
    {
      id: "seat-memory-read",
      nameEn: "Power Seat Memory Backup Read",
      nameRu: "Чтение памяти положений водительского сиденья (PSM)",
      txHex: "752",
      rxHex: "75A",
      category: "read",
      srpRef: "PSM-001..004.srp",
      explanationRu: "Опрашивает регистры положений памяти сиденья водителя.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["223201", "223202", "22142A", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-mird": [
    {
      id: "mird-memory-read",
      nameEn: "Door Mirror Memory Backup Read",
      nameRu: "Чтение памяти бокового зеркала водителя (DMI)",
      txHex: "752",
      rxHex: "75A",
      category: "read",
      srpRef: "DMI-001..004.srp",
      explanationRu: "Опрашивает регистры памяти положения зеркала водителя.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22350B", "22350C", "22145E", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-ac": [
    {
      id: "ac-actuator-init",
      nameEn: "Air Conditioner Actuator / Flap Initialization",
      nameRu: "Калибровка сервоприводов заслонок климата (Auto A/C)",
      txHex: "7C4",
      rxHex: "7CC",
      category: "calibration",
      srpRef: "AC-002..009.srp",
      explanationRu:
        "Выполняет калибровку крайних положений заслонок смешивания и распределения потоков воздуха (31 01 02 AC / B4 / B5 / B6).",
      conditionsRu: ["Зажигание IG ON", "Выполняется после снятия печки или замены моторчиков заслонок"],
      serviceActionId: "ac-flap-init",
      confirmRequired: true,
    },
  ],
  "sys-ab": [
    {
      id: "ab-system-data",
      nameEn: "Airbag System Data (Squibs, ODS & VIN Status)",
      nameRu: "Инспекция сопротивлений пиропатронов, ремней и датчика пассажира ODS",
      txHex: "780",
      rxHex: "788",
      category: "read",
      srpRef: "AB-001..008.srp",
      explanationRu:
        "Только чтение! Считывает статусы цепей подушек безопасности, преднатяжителей ремней, датчика присутствия пассажира ODS и статус блока.",
      conditionsRu: ["Зажигание IG ON", "Безопасная инспекция без изменения памяти SRS"],
      payloads: ["221022", "221023", "221044", "221045", "22105E", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-lt": [
    {
      id: "lt-srh-zero",
      nameEn: "SRH / ADB Headlight Auto-Leveling Zero Initialization",
      nameRu: "Инициализация нулевого уровня корректора и поворотных фар SRH / ADB",
      txHex: "74C",
      rxHex: "754",
      category: "calibration",
      srpRef: "LCT-001..003.srp",
      explanationRu:
        "Записывает нулевое положение датчиков высоты кузова и поворотных линз SRH/ADB после замены фар, рычагов подвески или датчика кузова.",
      conditionsRu: ["Автомобиль на ровной площадке, салон и багажник пусты", "Руль прямо (0.0°)", "Зажигание IG ON"],
      serviceActionId: "srh-headlight-zero",
      confirmRequired: true,
    },
  ],
  "sys-rab": [
    {
      id: "rab-history",
      nameEn: "RAB Sonar Calibration Check & Braking History",
      nameRu: "Проверка задних сонаров и истории срабатываний автоторможения RAB",
      txHex: "786",
      rxHex: "78E",
      category: "inspection",
      srpRef: "RAB-001..003.srp",
      explanationRu: "Считывает состояние 4 задних ультразвуковых датчиков (10A7..10AB) и историю срабатываний RAB.",
      conditionsRu: ["Зажигание IG ON", "Датчики в заднем бампере очищены"],
      serviceActionId: "rab-sonar-history",
    },
  ],
  "sys-dmn": [
    {
      id: "dmn-profiles",
      nameEn: "DriverFocus DMS Camera Status & Profiles",
      nameRu: "Опрос инфракрасной камеры DriverFocus и профилей водителей",
      txHex: "763",
      rxHex: "76B",
      category: "inspection",
      srpRef: "DMS-001..003.srp",
      explanationRu: "Считывает диагностические регистры камеры мониторинга усталости и распознавания лица (1060, 1061).",
      conditionsRu: ["Зажигание IG ON"],
      serviceActionId: "dms-seat-memory-read",
    },
  ],
  "sys-tlm": [
    {
      id: "tlm-dcm-status",
      nameEn: "Telematics DCM / eCall & Antenna Check",
      nameRu: "Диагностика телематики Starlink DCM / кнопки SOS",
      txHex: "765",
      rxHex: "76D",
      category: "inspection",
      srpRef: "TLM-048..051.srp",
      explanationRu: "Проверяет статус модема DCM, резервной батареи eCall и антенн (1032, 10DD..10DF).",
      conditionsRu: ["Зажигание IG ON"],
      serviceActionId: "tlm-dcm-diag",
    },
  ],
  "sys-cgtw": [
    {
      id: "cgtw-mac-status",
      nameEn: "Central Gateway & MAC Bus Status Check",
      nameRu: "Проверка Центрального шлюза CGW и MAC-статуса шины CAN",
      txHex: "750",
      rxHex: "758",
      category: "inspection",
      srpRef: "CGW-001 / MAC-001..002.srp",
      explanationRu:
        "Считывает состояние шлюза CGTW и счётчики синхронизации межсетевых шин (0250, 0251, 1020..103B).",
      conditionsRu: ["Зажигание IG ON"],
      serviceActionId: "cgw-unlock-mac-check",
    },
  ],
  // Immobilizer / Smart Key: STRICTLY excludes Key Registration / Deletion / ECM / Steering Lock / RES CM / TLM CM!
  "sys-immb": [
    {
      id: "immb-power-check",
      nameEn: "Immobilizer Power & Relay Status (Read-Only)",
      nameRu: "Чтение питания и статуса реле зажигания (только чтение)",
      txHex: "750",
      rxHex: "758",
      category: "read",
      explanationRu:
        "Функции регистрации ключей и привязки модулей вынесены в отдельный сервис «Кодирование Subaru (IMMO / RES)». Здесь доступно только безопасное чтение питания и идентификации блока.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22101B", "22F18E", "22F197"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-smtc": [
    {
      id: "smtc-power-check",
      nameEn: "Smart Access Power & Start Relay Status (Read-Only)",
      nameRu: "Статус питания и кнопки Start/Stop (без регистрации ключей)",
      txHex: "750",
      rxHex: "758",
      category: "read",
      explanationRu:
        "Регистрация смарт-ключей и привязка Remote Engine Start / Telematics CM выполняются в отдельном сервисе. Здесь доступно безопасное чтение питания.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22101B", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
  "sys-smtp": [
    {
      id: "smtp-power-check",
      nameEn: "Push-Button Power Supply Check (Read-Only)",
      nameRu: "Проверка цепей питания ACC / IG1 / IG2 / Starter",
      txHex: "750",
      rxHex: "758",
      category: "read",
      explanationRu: "Контролирует состояние реле питания кнопки Start-Stop.",
      conditionsRu: ["Зажигание IG ON"],
      payloads: ["22104E", "221052", "221057", "22F18E"],
      stopOnWriteSuccess: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// SSM4 F2 Cancel Code Specifications
// ---------------------------------------------------------------------------
const CANCEL_CODES_BY_TX: Record<string, readonly SubaruCancelCodeSpec[]> = {
  "7E0": [
    {
      id: "egi-cancel-cruise",
      nameEn: "Cruise Control / Auto Start-Stop Cancel Code",
      nameRu: "Коды отмены круиз-контроля и Auto Start-Stop",
      txHex: "7E0",
      rxHex: "7E8",
      explanationRu:
        "Показывает причины, по которым ECM отменил круиз-контроль или запретил остановку двигателя Start-Stop (счётчик IG, перегрев, датчик нейтрали/тормоза).",
      readPayloads: ["22101E", "2214E0", "2214F8", "0101"],
    },
  ],
  "7E1": [
    {
      id: "tm-cancel-iss",
      nameEn: "CVT / Start-Stop Inhibit Code (AS.FCLT)",
      nameRu: "Коды запрета Start-Stop и блокировок вариатора (TM)",
      txHex: "7E1",
      rxHex: "7E9",
      explanationRu:
        "Считывает внутренние флаги запрета трансмиссии (DID 104C, 14E9, 14EA, 1501..1505) и готовность электронасоса EOP (1051, 105D).",
      readPayloads: ["22104C", "221051", "22105D", "2214E9", "2214EA", "221501"],
    },
  ],
  "7B0": [
    {
      id: "bc-cancel-vdc",
      nameEn: "VDC / AVH / EPB Temporary Cancel History",
      nameRu: "Коды временного отключения VDC / Auto Vehicle Hold",
      txHex: "7B0",
      rxHex: "7B8",
      explanationRu:
        "Показывает условия, вызвавшие временную деактивацию AVH или VDC (датчик угла руля, просадка напряжения, температура тормозов).",
      readPayloads: ["22102B", "221001", "221006", "1902FF"],
    },
  ],
  "787": [
    {
      id: "es-cancel-stop",
      nameEn: "EyeSight Temporary Stop Cause (0..31)",
      nameRu: "Причины временной остановки EyeSight (белый индикатор камеры)",
      txHex: "787",
      rxHex: "78F",
      explanationRu:
        "Считывает последние причины временного отключения стереокамеры EyeSight (засветка солнцем, туман/запотевание стекла, низкий контраст, загрязнение, ошибка от VDC/ECM).",
      readPayloads: ["224001", "224002", "224003", "2243E1", "2243E2", "1902FF"],
    },
  ],
  "786": [
    {
      id: "rab-cancel-stop",
      nameEn: "RAB Temporary Inhibit & Sensor Blanking",
      nameRu: "Причины временной блокировки RAB (грязь / прицеп)",
      txHex: "786",
      rxHex: "78E",
      explanationRu: "Проверяет регистры блокировки сонаров и историю временного отключения RAB.",
      readPayloads: ["22101E", "221033", "2210AB"],
    },
  ],
  "763": [
    {
      id: "dmn-cancel-stop",
      nameEn: "DriverFocus DMS Temporary Stop Status",
      nameRu: "Причины временной остановки камеры DriverFocus",
      txHex: "763",
      rxHex: "76B",
      explanationRu: "Проверяет флаги засветки ИК-камеры, перекрытия рулём или солнцезащитными очками.",
      readPayloads: ["221060", "221061", "221025"],
    },
  ],
};

// ---------------------------------------------------------------------------
// SSM4 F6 Customize Items per System (from SSM4 screenshots + safe UDS DIDs)
// Note: Meter 12-col / °F->°C region items & EyeSight 35xx items are EXCLUDED.
// ---------------------------------------------------------------------------
const CUSTOMIZE_BY_SYSTEM_ID: Record<string, readonly SubaruCustomizeOptionSpec[]> = {
  "sys-biu": [
    {
      id: "biu-cust-autolock",
      nameEn: "Vehicle Automatic Door Lock",
      nameRu: "Автоматическое запирание дверей",
      txHex: "752",
      rxHex: "75A",
      didHex: "107A",
      categoryRu: "Замки и безопасность (BIU)",
      defaultText: "Vehicle Speed (по скорости)",
      options: [
        { labelEn: "OFF", labelRu: "Выкл (OFF)" },
        { labelEn: "Vehicle Speed", labelRu: "По скорости" },
        { labelEn: "Shift Position", labelRu: "По селектору P/D" },
      ],
    },
    {
      id: "biu-cust-autounlock",
      nameEn: "Vehicle Automatic Door Unlock",
      nameRu: "Автоматическое отпирание дверей",
      txHex: "752",
      rxHex: "75A",
      didHex: "107A",
      categoryRu: "Замки и безопасность (BIU)",
      defaultText: "Shift Position / IG OFF",
      options: [
        { labelEn: "OFF", labelRu: "Выкл (OFF)" },
        { labelEn: "Driver Door", labelRu: "При открытии двери водителя" },
        { labelEn: "Shift Position", labelRu: "При переводе в P" },
        { labelEn: "IG OFF", labelRu: "При выключении зажигания" },
      ],
    },
    {
      id: "biu-cust-drl",
      nameEn: "Daytime Running Light (DRL) Setting",
      nameRu: "Дневные ходовые огни (DRL)",
      txHex: "752",
      rxHex: "75A",
      didHex: "2028",
      categoryRu: "Освещение (BIU)",
      defaultText: "ON / Dedicated DRL",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "High Beam Dim", labelRu: "Дальний вполнакала" },
        { labelEn: "Dedicated DRL", labelRu: "Светодиодная полоса DRL" },
      ],
    },
    {
      id: "biu-cust-one-touch",
      nameEn: "Lane Change Signal Setting (One-Touch Turn)",
      nameRu: "Кратковременный поворотник (3 моргания)",
      txHex: "752",
      rxHex: "75A",
      didHex: "1061",
      categoryRu: "Освещение (BIU)",
      defaultText: "Support / ON",
      options: [
        { labelEn: "No Support / OFF", labelRu: "Выкл" },
        { labelEn: "Support / ON", labelRu: "Вкл (3 вспышки)" },
      ],
    },
    {
      id: "biu-cust-defogger",
      nameEn: "Rr Defogger op. mode",
      nameRu: "Режим обогрева заднего стекла и зеркал",
      txHex: "752",
      rxHex: "75A",
      didHex: "106C",
      categoryRu: "Обогрев (BIU)",
      defaultText: "Normal (15 мин)",
      options: [
        { labelEn: "Normal", labelRu: "Таймер (15 мин)" },
        { labelEn: "Continuous", labelRu: "Непрерывный" },
      ],
    },
    {
      id: "biu-cust-alarm",
      nameEn: "Security Alarm Setup",
      nameRu: "Штатная охранная сигнализация",
      txHex: "752",
      rxHex: "75A",
      didHex: "101E",
      categoryRu: "Охрана (BIU)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "ON", labelRu: "Вкл" },
      ],
    },
    {
      id: "biu-cust-lockout",
      nameEn: "Lockout prevention",
      nameRu: "Защита от запирания ключа в салоне",
      txHex: "752",
      rxHex: "75A",
      didHex: "107A",
      categoryRu: "Охрана (BIU)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "ON", labelRu: "Вкл" },
      ],
    },
    {
      id: "biu-cust-wiper-deicer",
      nameEn: "Wiper Deicer setting",
      nameRu: "Режим обогрева зоны покоя дворников",
      txHex: "752",
      rxHex: "75A",
      didHex: "106B",
      categoryRu: "Обогрев (BIU)",
      defaultText: "Normal",
      options: [
        { labelEn: "Normal", labelRu: "Таймер (15 мин)" },
        { labelEn: "Continuous", labelRu: "Непрерывный" },
      ],
    },
    {
      id: "biu-cust-auto-light",
      nameEn: "Auto Light Sensitivity Adjustment",
      nameRu: "Чувствительность датчика автосвета",
      txHex: "752",
      rxHex: "75A",
      didHex: "1062",
      categoryRu: "Освещение (BIU)",
      defaultText: "Normal",
      options: [
        { labelEn: "Low", labelRu: "Низкая (позже)" },
        { labelEn: "Normal", labelRu: "Стандарт" },
        { labelEn: "High", labelRu: "Высокая (раньше)" },
        { labelEn: "Very High", labelRu: "Максимальная" },
      ],
    },
    {
      id: "biu-cust-wiper-auto-light",
      nameEn: "Wiper link Auto Light Setup",
      nameRu: "Автовключение фар при работе стеклоочистителей",
      txHex: "752",
      rxHex: "75A",
      didHex: "1061",
      categoryRu: "Освещение (BIU)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "ON", labelRu: "Вкл" },
      ],
    },
    {
      id: "biu-cust-dome-delay",
      nameEn: "Illumination Sensor / Dome Light Delay",
      nameRu: "Задержка выключения салонного освещения",
      txHex: "752",
      rxHex: "75A",
      didHex: "101B",
      categoryRu: "Комфорт (BIU)",
      defaultText: "30 sec",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "15 sec", labelRu: "15 сек" },
        { labelEn: "30 sec", labelRu: "30 сек" },
      ],
    },
  ],
  "sys-ac": [
    {
      id: "ac-cust-temp-offset",
      nameEn: "Foot/Face Temp Correction & Auto A/C Setting",
      nameRu: "Коррекция целевой температуры климата (A/C)",
      txHex: "7C4",
      rxHex: "7CC",
      didHex: "10E1",
      categoryRu: "Климат-контроль (AC)",
      defaultText: "0 °C (Стандарт)",
      options: [
        { labelEn: "-2 °C", labelRu: "Прохладнее (-2 °C)" },
        { labelEn: "0 °C", labelRu: "Стандарт (0 °C)" },
        { labelEn: "+2 °C", labelRu: "Теплее (+2 °C)" },
      ],
    },
    {
      id: "ac-cust-recirc",
      nameEn: "Auto Recirculation Control",
      nameRu: "Автоматическое управление рециркуляцией",
      txHex: "7C4",
      rxHex: "7CC",
      didHex: "1230",
      categoryRu: "Климат-контроль (AC)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "ON", labelRu: "Вкл" },
      ],
    },
  ],
  "sys-met": [
    // Only non-region user meter customize items; NO 12-col / °F->°C here!
    {
      id: "met-cust-dimmer",
      nameEn: "Illumination Dimmer & Needle Brightness",
      nameRu: "Яркость подсветки приборной панели (Dimmer)",
      txHex: "783",
      rxHex: "78B",
      didHex: "1062",
      categoryRu: "Индикация (Meter)",
      defaultText: "По регулятору",
      options: [
        { labelEn: "Standard", labelRu: "Стандартная" },
        { labelEn: "Night Dim", labelRu: "Ночное приглушение" },
      ],
      noteRu: "Смена региона °F→°C и 12-колоночный код находятся в отдельном сервисе «Кодирование Subaru».",
    },
  ],
  "sys-es": [
    // Only driver-assistance preference readouts; NO 35xx / Selection of Parameter!
    {
      id: "es-cust-warning-vol",
      nameEn: "EyeSight Warning Volume & Lead Vehicle Alert",
      nameRu: "Громкость предупреждений EyeSight и старт впереди идущего авто",
      txHex: "787",
      rxHex: "78F",
      didHex: "F18E",
      categoryRu: "Ассистенты EyeSight",
      defaultText: "Medium / ON",
      options: [
        { labelEn: "Low", labelRu: "Тихо" },
        { labelEn: "Medium", labelRu: "Средне" },
        { labelEn: "High", labelRu: "Громко" },
      ],
      noteRu: "Региональные параметры EyeSight (ADA-031/032) вынесены в отдельный сервис «Кодирование Subaru».",
    },
  ],
  "sys-prg": [
    {
      id: "prg-cust-beep",
      nameEn: "Power Rear Gate Buzzer & Memory Height",
      nameRu: "Зуммер и память высоты подъёма 5-й двери (PRG)",
      txHex: "752",
      rxHex: "75A",
      didHex: "101E",
      categoryRu: "Багажник (PRG)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Без звука" },
        { labelEn: "ON", labelRu: "Зуммер вкл" },
      ],
    },
  ],
  "sys-lt": [
    {
      id: "lt-cust-srh",
      nameEn: "SRH / HBA High Beam Assist Setting",
      nameRu: "Адаптивный дальний свет HBA и поворотные фары SRH",
      txHex: "74C",
      rxHex: "754",
      didHex: "10A1",
      categoryRu: "Освещение (LT)",
      defaultText: "ON",
      options: [
        { labelEn: "OFF", labelRu: "Выкл" },
        { labelEn: "ON", labelRu: "Вкл" },
      ],
    },
  ],
  "sys-rab": [
    {
      id: "rab-cust-buzzer",
      nameEn: "RAB & Sonar Warning Buzzer Volume",
      nameRu: "Громкость зуммера сонаров и RAB",
      txHex: "786",
      rxHex: "78E",
      didHex: "1033",
      categoryRu: "Парктроник и RAB",
      defaultText: "Normal",
      options: [
        { labelEn: "Low", labelRu: "Тихо" },
        { labelEn: "Normal", labelRu: "Стандарт" },
        { labelEn: "High", labelRu: "Громко" },
      ],
    },
  ],
};

function sanitizeWorkSupport(items: readonly SubaruWorkSupportItem[]): SubaruWorkSupportItem[] {
  return items.filter((item) => !EXCLUDED_SUBARU_CODING_WORK_IDS.has(item.id));
}

/**
 * Returns the complete SSM4 drill-down profile (Select Function tabs, Active Tests,
 * Work Support, Cancel Codes, Customize, and Signals) for any system in `SSM4_FULL_SYSTEMS`.
 */
export function getSubaruBlockProfile(system: Ssm4SystemEntry): SubaruBlockProfile {
  const tx = system.txHex.toUpperCase();
  const activeTests = ACTIVE_TESTS_BY_TX[tx] ?? [];
  const rawWork = WORK_SUPPORT_BY_SYSTEM_ID[system.id] ?? [];
  const workSupport = sanitizeWorkSupport(rawWork);
  const cancelCodes = CANCEL_CODES_BY_TX[tx] ?? [];
  const customizeItems = CUSTOMIZE_BY_SYSTEM_ID[system.id] ?? [];
  const signals = SSM4_SIGNALS.filter((s) => s.ecuId === system.ecuId);

  const tabs: SubaruFunctionTabId[] = ["dtc"];
  if (cancelCodes.length > 0 || system.functions.includes(907)) {
    tabs.push("cancel-code");
  }
  if (signals.length > 0 || system.functions.includes(2)) {
    tabs.push("data-monitor");
  }
  if (activeTests.length > 0 || system.functions.includes(3)) {
    tabs.push("active-test");
  }
  tabs.push("work-support");
  if (customizeItems.length > 0 || system.supportsCustomize) {
    tabs.push("customize");
  }
  tabs.push("ecu-info");

  return {
    system,
    tabs,
    activeTests,
    workSupport,
    cancelCodes,
    customizeItems,
    signals,
  };
}

export function getAllSubaruBlockProfiles(): SubaruBlockProfile[] {
  return SSM4_FULL_SYSTEMS.map(getSubaruBlockProfile);
}

/**
 * Normalizes DTC clearability for Subaru blocks matching `obd-session.ts` `clearModuleDtcsSafe`:
 * EPS/SAS (746) & EyeSight (787) are strictly read-only to protect calibrations.
 */
export function isSubaruTxSafeToClear(txHex: string): boolean {
  const clean = txHex.trim().toUpperCase();
  return clean !== "746" && clean !== "787";
}
