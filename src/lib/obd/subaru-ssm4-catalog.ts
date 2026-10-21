import { decodeUdsDidSupportBitmap, formatUdsPayload, isUdsBitmapDid } from "./uds";

export type Ssm4Group = "Powertrain" | "Chassis" | "Body";

export type Ssm4FunctionId =
  | 1 // DIAG_FREEZE (DTC Current / History / Pending / Permanent & Freeze Frame)
  | 2 // DATA_MONITOR (ECU Data Monitor + Custom List .CT + Triggers + Cursors A/B)
  | 3 // ACTIVE_TEST (Read-Only reference in QHub)
  | 16 // DIAG (System Check / Readiness)
  | 20 // CUSTOMIZE (Personalize / BIU / Meter / EyeSight Read-Only settings & Diff)
  | 902 // UTILITY (Calibration / Inspection Modes — Read-Only live monitors & prerequisites)
  | 909 // OBD_VEHICLE_INFO (VIN, CalID, CVN, Part Number, SW Version)
  | 915 // AIRBAG_SYSTEM_DATA (SRS pyrotechnic squibs & seatbelt status)
  | 918; // GET_DIAG_INFO (All-System DTC Scan)

export interface Ssm4VehicleModel {
  id: string;
  division: string;
  modelCode: string;
  nameRu: string;
  years: string;
  engines: string[];
  vinPrefixes: string[];
  chassisCodes: string[];
  platform: "SGP" | "Gen4";
}

export interface Ssm4SignalDef {
  id: string;
  ecuId: number;
  customList: string; // e.g. "Diagnosis", "Fuel System", "ETCS", "VVT & Turbo", "Roughness", "ATM / CVT", "TPMS", "Sensor Monitor"
  nameEn: string;
  nameRu: string;
  shortName: string;
  unit: string;
  protocol: "ssm-a8" | "uds-22" | "obd-01";
  addressOrDid: string; // 6-hex for SSM A8 (e.g. "000008"), 4-hex for UDS 22 (e.g. "1041"), 2-hex for OBD 01 (e.g. "0C")
  byteIndex?: number;
  byteLen: 1 | 2;
  signed?: boolean;
  bitIndex?: number;
  mul: number;
  div: number;
  offset: number;
  decimals: number;
  min: number;
  max: number;
  enums?: Record<number, string>;
}

export interface Ssm4CustomizeItem {
  id: string;
  ecuId: number;
  txHex: string;
  rxHex: string;
  didHex: string;
  nameEn: string;
  nameRu: string;
  categoryRu: string;
  defaultText: string;
  optionsRu: string[];
  decode: (bytes: number[]) => string;
}

export interface Ssm4UtilitySpec {
  id: string;
  ecuId: number;
  txHex: string;
  rxHex: string;
  titleRu: string;
  titleEn: string;
  ssmFunctionCode: string;
  purposeRu: string;
  conditionsRu: string[];
  liveDids: { did: string; labelRu: string }[];
  safetyNoteRu: string;
}

export interface Ssm4EcuDef {
  ecuId: number; // Matches SSM4 internal m_dwEcuId where applicable (234=Engine, 105=Brake, 121=A/C, 188=Airbag, 118=4WD/TCM, etc.)
  code: string;
  nameEn: string;
  nameRu: string;
  group: Ssm4Group;
  txHex: string;
  rxHex: string;
  canSafeClear: boolean;
  safetyCritical: boolean;
  mode03Fallback?: boolean;
  functions: Ssm4FunctionId[];
  customLists: string[];
}

export const SSM4_VEHICLES: readonly Ssm4VehicleModel[] = [
  {
    id: "sk-forester-sgp",
    division: "FORESTER",
    modelCode: "SK (SGP)",
    nameRu: "Subaru Forester V (SK · SGP)",
    years: "2018–2024",
    engines: ["FB20D (2.0L DI)", "FB25D (2.5L DI)", "CB18 (1.8L DIT)"],
    vinPrefixes: ["JF1SK", "JF2SK", "4S4WM"],
    chassisCodes: ["SK5", "SK7", "SK9", "SKE"],
    platform: "SGP",
  },
  {
    id: "bt-outback-sgp",
    division: "LEGACY / OUTBACK",
    modelCode: "BT / BW (SGP)",
    nameRu: "Subaru Outback VI / Legacy VII (BT / BW · SGP 2.4T / 2.5)",
    years: "2020–2026",
    engines: ["FA24F (2.4L DIT Turbo)", "FB25D (2.5L DI)", "CB18 (1.8L DIT)"],
    vinPrefixes: ["4S4BT", "4S3BW", "JF1BT", "JF2BT"],
    chassisCodes: ["BT5", "BT9", "BTA", "BW"],
    platform: "SGP",
  },
  {
    id: "gt-gk-xv-impreza-sgp",
    division: "IMPREZA / XV / CROSSTREK",
    modelCode: "GT / GK / GU (SGP)",
    nameRu: "Subaru XV / Crosstrek / Impreza (GT / GK / GU · SGP)",
    years: "2017–2026",
    engines: ["FB20D (2.0L DI)", "FB25D (2.5L DI)", "FB16 (1.6L)"],
    vinPrefixes: ["JF1GT", "JF2GT", "JF1GK", "JF1GU", "4S4GU"],
    chassisCodes: ["GT3", "GT7", "GTE", "GK7", "GU"],
    platform: "SGP",
  },
  {
    id: "va-vm-vb-wrx-levorg",
    division: "WRX & WRX STI & LEVORG",
    modelCode: "VA / VM / VB / VN",
    nameRu: "Subaru WRX / STI / Levorg (VA / VM / VB / VN)",
    years: "2014–2026",
    engines: ["FA20F (2.0L DIT)", "FA24F (2.4L DIT)", "EJ257 (2.5L STI)", "FB16F (1.6L DIT)"],
    vinPrefixes: ["JF1VA", "JF1VM", "JF1VB", "JF1VN"],
    chassisCodes: ["VAB", "VAG", "VM4", "VMG", "VBH", "VN5", "VNH"],
    platform: "SGP",
  },
  {
    id: "bn-bs-sj-gen4",
    division: "LEGACY / OUTBACK / FORESTER (Gen4)",
    modelCode: "BN / BS / SJ",
    nameRu: "Subaru Outback V / Legacy VI / Forester IV (BS / BN / SJ)",
    years: "2013–2019",
    engines: ["FB20 (2.0L)", "FB25 (2.5L)", "FA20F (2.0L XT)", "EZ36D (3.6R)"],
    vinPrefixes: ["JF1BS", "JF2BS", "JF1BN", "4S4BS", "4S3BN", "JF1SJ", "JF2SJ"],
    chassisCodes: ["BS9", "BN9", "SJ5", "SJ9", "SJG"],
    platform: "Gen4",
  },
  {
    id: "wm-ascent-sgp",
    division: "ASCENT / EVOLTIS",
    modelCode: "WM (SGP)",
    nameRu: "Subaru Ascent / Evoltis (WM · 2.4L Turbo SGP)",
    years: "2019–2026",
    engines: ["FA24F (2.4L DIT Turbo)"],
    vinPrefixes: ["4S4WM"],
    chassisCodes: ["WMA", "WM"],
    platform: "SGP",
  },
];

export const SSM4_ECUS: readonly Ssm4EcuDef[] = [
  {
    ecuId: 234,
    code: "ENG",
    nameEn: "Engine Control (ECM)",
    nameRu: "Двигатель (ECM)",
    group: "Powertrain",
    txHex: "7E0",
    rxHex: "7E8",
    canSafeClear: true,
    safetyCritical: false,
    mode03Fallback: true,
    functions: [1, 2, 3, 16, 902, 909, 918],
    customLists: [
      "All Data",
      "Diagnosis",
      "Fuel System",
      "ETCS",
      "VVT & Turbo",
      "Roughness",
      "EGR & Evap",
      "Switches & IO",
    ],
  },
  {
    ecuId: 118,
    code: "TCM",
    nameEn: "Transmission Control (TCM / Lineartronic CVT)",
    nameRu: "Коробка передач / Вариатор Lineartronic (TCM)",
    group: "Powertrain",
    txHex: "7E1",
    rxHex: "7E9",
    canSafeClear: true,
    safetyCritical: false,
    mode03Fallback: true,
    functions: [1, 2, 16, 902, 909, 918],
    customLists: ["All Data", "ATM / CVT"],
  },
  {
    ecuId: 236,
    code: "PTM",
    nameEn: "SGP Powertrain / 2.4 Turbo Control (7A2)",
    nameRu: "Силовая установка SGP 2.4 Turbo / термоконтур (7A2)",
    group: "Powertrain",
    txHex: "7A2",
    rxHex: "7AA",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 902, 909, 918],
    customLists: ["All Data", "Thermal & Drive"],
  },
  {
    ecuId: 105,
    code: "ABS",
    nameEn: "Brake Control (ABS / VDC / EPB)",
    nameRu: "Тормозная система ABS / VDC / Электроручник EPB",
    group: "Chassis",
    txHex: "7B0",
    rxHex: "7B8",
    canSafeClear: false,
    safetyCritical: true,
    functions: [1, 2, 902, 909, 918],
    customLists: ["All Data", "Sensor Monitor", "Solenoid & EPB"],
  },
  {
    ecuId: 147,
    code: "EPS",
    nameEn: "Electric Power Steering (EPS)",
    nameRu: "Электроусилитель руля и датчик угла (EPS)",
    group: "Chassis",
    txHex: "746",
    rxHex: "74E",
    canSafeClear: false,
    safetyCritical: true,
    functions: [1, 2, 902, 909, 918],
    customLists: ["All Data", "Steering & Angle"],
  },
  {
    ecuId: 170,
    code: "BIU",
    nameEn: "Body Integrated Unit & TPMS (BIU)",
    nameRu: "Боди-модуль BIU и давление в шинах TPMS",
    group: "Body",
    txHex: "752",
    rxHex: "75A",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 20, 902, 909, 918],
    customLists: ["All Data", "TPMS", "Body & Power"],
  },
  {
    ecuId: 165,
    code: "MET",
    nameEn: "Combination Meter (SGP)",
    nameRu: "Комбинация приборов (Meter SGP)",
    group: "Body",
    txHex: "783",
    rxHex: "78B",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 20, 902, 909, 918],
    customLists: ["All Data", "Fuel & Illumination"],
  },
  {
    ecuId: 203,
    code: "ES",
    nameEn: "EyeSight Stereo Camera",
    nameRu: "Стереокамера и ассистенты EyeSight",
    group: "Chassis",
    txHex: "787",
    rxHex: "78F",
    canSafeClear: false,
    safetyCritical: true,
    functions: [1, 2, 20, 902, 909, 918],
    customLists: ["All Data", "Camera & ADAS"],
  },
  {
    ecuId: 171,
    code: "RAB",
    nameEn: "Reverse Automatic Braking / Sonar (RAB)",
    nameRu: "Сонары и автоторможение задним ходом (RAB)",
    group: "Body",
    txHex: "786",
    rxHex: "78E",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 20, 909, 918],
    customLists: ["All Data"],
  },
  {
    ecuId: 121,
    code: "AC",
    nameEn: "Air Conditioner (Auto A/C)",
    nameRu: "Климат-контроль (Auto A/C)",
    group: "Body",
    txHex: "7C4",
    rxHex: "7CC",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 20, 909, 918],
    customLists: ["All Data"],
  },
  {
    ecuId: 188,
    code: "SRS",
    nameEn: "SRS Airbag System",
    nameRu: "Подушки безопасности (SRS Airbag)",
    group: "Body",
    txHex: "780",
    rxHex: "788",
    canSafeClear: false,
    safetyCritical: true,
    functions: [1, 2, 909, 915, 918],
    customLists: ["All Data", "Squibs & Seatbelts"],
  },
  {
    ecuId: 164,
    code: "KEY",
    nameEn: "Keyless Access / Push Start / Gateway",
    nameRu: "Бесключевой доступ и запуск (Keyless / Push Start)",
    group: "Body",
    txHex: "750",
    rxHex: "758",
    canSafeClear: true,
    safetyCritical: false,
    functions: [1, 2, 20, 909, 918],
    customLists: ["All Data"],
  },
];

export const SSM4_SIGNALS: readonly Ssm4SignalDef[] = [
  // Engine 234 (7E0 -> 7E8) — SSM 0xA8 and SAE Mode 01
  {
    id: "eng-coolant-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Coolant Temp.",
    nameRu: "Температура охлаждающей жидкости (SSM)",
    shortName: "ECT",
    unit: "°C",
    protocol: "ssm-a8",
    addressOrDid: "000008",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "eng-rpm-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Engine Speed",
    nameRu: "Обороты двигателя (SSM)",
    shortName: "RPM",
    unit: "об/мин",
    protocol: "ssm-a8",
    addressOrDid: "00000E",
    byteLen: 2,
    mul: 1,
    div: 4,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 8000,
  },
  {
    id: "eng-speed-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Vehicle Speed",
    nameRu: "Скорость автомобиля (SSM)",
    shortName: "VSS",
    unit: "км/ч",
    protocol: "ssm-a8",
    addressOrDid: "000010",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "eng-iat-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Intake Air Temp.",
    nameRu: "Температура воздуха на впуске (SSM)",
    shortName: "IAT",
    unit: "°C",
    protocol: "ssm-a8",
    addressOrDid: "000012",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "eng-ign-timing-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Ignition Timing",
    nameRu: "Угол опережения зажигания (ITA)",
    shortName: "ITA",
    unit: "°",
    protocol: "ssm-a8",
    addressOrDid: "000011",
    byteLen: 1,
    mul: 1,
    div: 2,
    offset: -64,
    decimals: 1,
    min: -64,
    max: 63.5,
  },
  {
    id: "eng-knock-corr-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Fine Learning Knock Correction",
    nameRu: "Обученная коррекция по детонации / IAM",
    shortName: "KNK",
    unit: "°",
    protocol: "ssm-a8",
    addressOrDid: "000022",
    byteLen: 1,
    mul: 1,
    div: 2,
    offset: -64,
    decimals: 1,
    min: -64,
    max: 63.5,
  },
  {
    id: "eng-maf-g-ssm",
    ecuId: 234,
    customList: "Fuel System",
    nameEn: "Mass Air Flow",
    nameRu: "Массовый расход воздуха (MAF)",
    shortName: "MAF",
    unit: "г/с",
    protocol: "ssm-a8",
    addressOrDid: "000013",
    byteLen: 2,
    mul: 1,
    div: 100,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 655,
  },
  {
    id: "eng-af-corr-1-ssm",
    ecuId: 234,
    customList: "Fuel System",
    nameEn: "A/F Correction #1 (STFT)",
    nameRu: "Краткосрочная топливная коррекция #1 (A/F Corr)",
    shortName: "AF_C1",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "000009",
    byteLen: 1,
    mul: 100,
    div: 128,
    offset: -100,
    decimals: 1,
    min: -100,
    max: 99.2,
  },
  {
    id: "eng-af-learn-1-ssm",
    ecuId: 234,
    customList: "Fuel System",
    nameEn: "A/F Learning #1 (LTFT)",
    nameRu: "Долгосрочная топливная коррекция #1 (A/F Learn)",
    shortName: "AF_L1",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "00000A",
    byteLen: 1,
    mul: 100,
    div: 128,
    offset: -100,
    decimals: 1,
    min: -100,
    max: 99.2,
  },
  {
    id: "eng-inj-pw-ssm",
    ecuId: 234,
    customList: "Fuel System",
    nameEn: "Fuel Injection Pulse Width",
    nameRu: "Длительность впрыска топлива (TAUZ)",
    shortName: "TAUZ",
    unit: "мс",
    protocol: "ssm-a8",
    addressOrDid: "000020",
    byteLen: 1,
    mul: 32,
    div: 125,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 65,
  },
  {
    id: "eng-fuel-level-v-ssm",
    ecuId: 234,
    customList: "Fuel System",
    nameEn: "Fuel Level Sensor Voltage",
    nameRu: "Напряжение датчика уровня топлива",
    shortName: "FLV",
    unit: "В",
    protocol: "ssm-a8",
    addressOrDid: "00002E",
    byteLen: 1,
    mul: 2,
    div: 100,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 5.1,
  },
  {
    id: "eng-throttle-open-ssm",
    ecuId: 234,
    customList: "ETCS",
    nameEn: "Throttle Opening Angle",
    nameRu: "Угол открытия дроссельной заслонки (TP_M)",
    shortName: "TP_M",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "000015",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-accel-open-ssm",
    ecuId: 234,
    customList: "ETCS",
    nameEn: "Accel. Opening Angle",
    nameRu: "Угол нажатия педали акселератора (APP)",
    shortName: "ACCEL",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "0000FF",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-batt-volts-ssm",
    ecuId: 234,
    customList: "Diagnosis",
    nameEn: "Battery Voltage",
    nameRu: "Напряжение бортсети ЭБУ ДВС",
    shortName: "BATT",
    unit: "В",
    protocol: "ssm-a8",
    addressOrDid: "00001C",
    byteLen: 1,
    mul: 8,
    div: 100,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 20.4,
  },
  {
    id: "eng-map-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "Manifold Absolute Pressure",
    nameRu: "Абсолютное давление во впускном коллекторе (MAP)",
    shortName: "MAP",
    unit: "кПа",
    protocol: "ssm-a8",
    addressOrDid: "00000D",
    byteLen: 1,
    mul: 100,
    div: 85,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 300,
  },
  {
    id: "eng-baro-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "Atmospheric Pressure",
    nameRu: "Атмосферное давление (BARO)",
    shortName: "BARO",
    unit: "кПа",
    protocol: "ssm-a8",
    addressOrDid: "000023",
    byteLen: 1,
    mul: 100,
    div: 85,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 150,
  },
  {
    id: "eng-vvt-r-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "VVT Adv. Ang. Amount R",
    nameRu: "Угол муфты фазовращателя AVCS Правый (R)",
    shortName: "VVT_R",
    unit: "°",
    protocol: "ssm-a8",
    addressOrDid: "00003C",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -50,
    decimals: 0,
    min: -50,
    max: 50,
  },
  {
    id: "eng-vvt-l-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "VVT Adv. Ang. Amount L",
    nameRu: "Угол муфты фазовращателя AVCS Левый (L)",
    shortName: "VVT_L",
    unit: "°",
    protocol: "ssm-a8",
    addressOrDid: "00003D",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -50,
    decimals: 0,
    min: -50,
    max: 50,
  },
  {
    id: "eng-ocv-duty-r-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "OCV Duty Ratio R",
    nameRu: "Скважность клапана OCV AVCS Правый (R)",
    shortName: "OCV_R",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "00003E",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-ocv-duty-l-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "OCV Duty Ratio L",
    nameRu: "Скважность клапана OCV AVCS Левый (L)",
    shortName: "OCV_L",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "00003F",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-wastegate-ssm",
    ecuId: 234,
    customList: "VVT & Turbo",
    nameEn: "Primary Wastegate Duty Ratio",
    nameRu: "Скважность соленоида вестгейта турбины",
    shortName: "WGDC",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "000030",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-cpc-duty-ssm",
    ecuId: 234,
    customList: "EGR & Evap",
    nameEn: "CPC Valve Duty Ratio",
    nameRu: "Скважность клапана продувки адсорбера (CPC)",
    shortName: "CPC",
    unit: "%",
    protocol: "ssm-a8",
    addressOrDid: "000032",
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },
  {
    id: "eng-roughness-1-ssm",
    ecuId: 234,
    customList: "Roughness",
    nameEn: "#1 Cylinder Roughness Monitor",
    nameRu: "Счётчик неравномерности / пропусков Цилиндр #1",
    shortName: "CYLMON1",
    unit: "имп",
    protocol: "ssm-a8",
    addressOrDid: "0000CE",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "eng-roughness-2-ssm",
    ecuId: 234,
    customList: "Roughness",
    nameEn: "#2 Cylinder Roughness Monitor",
    nameRu: "Счётчик неравномерности / пропусков Цилиндр #2",
    shortName: "CYLMON2",
    unit: "имп",
    protocol: "ssm-a8",
    addressOrDid: "0000CF",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "eng-roughness-3-ssm",
    ecuId: 234,
    customList: "Roughness",
    nameEn: "#3 Cylinder Roughness Monitor",
    nameRu: "Счётчик неравномерности / пропусков Цилиндр #3",
    shortName: "CYLMON3",
    unit: "имп",
    protocol: "ssm-a8",
    addressOrDid: "0000D8",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "eng-roughness-4-ssm",
    ecuId: 234,
    customList: "Roughness",
    nameEn: "#4 Cylinder Roughness Monitor",
    nameRu: "Счётчик неравномерности / пропусков Цилиндр #4",
    shortName: "CYLMON4",
    unit: "имп",
    protocol: "ssm-a8",
    addressOrDid: "0000D9",
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "eng-sw-clutch-ssm",
    ecuId: 234,
    customList: "Switches & IO",
    nameEn: "Clutch Switch",
    nameRu: "Концевик педали сцепления",
    shortName: "CLUTCH",
    unit: "",
    protocol: "ssm-a8",
    addressOrDid: "000121",
    byteLen: 1,
    bitIndex: 7,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 1,
    enums: { 0: "OFF", 1: "ON" },
  },
  {
    id: "eng-sw-brake-ssm",
    ecuId: 234,
    customList: "Switches & IO",
    nameEn: "Brake Switch",
    nameRu: "Концевик педали тормоза (Stop Light Sw)",
    shortName: "BRAKE",
    unit: "",
    protocol: "ssm-a8",
    addressOrDid: "000121",
    byteLen: 1,
    bitIndex: 3,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 1,
    enums: { 0: "OFF", 1: "ON" },
  },

  // SGP 2.4T Powertrain / Thermal 236 (7A2 -> 7AA) — UDS 0x22
  {
    id: "ptm-oil-temp",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "Engine Oil / Unit Temp (1297)",
    nameRu: "Температура масла ДВС / агрегата (DID 1297)",
    shortName: "OIL_T",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "1297",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "ptm-intake-temp",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "Intake / Underhood Temp (1298)",
    nameRu: "Температура впуска / подкапотная (DID 1298)",
    shortName: "INT_T",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "1298",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "ptm-cvt-fluid-temp",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "CVT Fluid / Unit Temp (103D)",
    nameRu: "Температура рабочей жидкости КПП / узла (DID 103D)",
    shortName: "CVTF",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "103D",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "ptm-circuit-a-temp",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "Thermal Loop A Temp (10CB)",
    nameRu: "Температура термоконтура A (DID 10CB)",
    shortName: "LOOP_A",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "10CB",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "ptm-circuit-b-temp",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "Thermal Loop B Temp (10CC)",
    nameRu: "Температура термоконтура B (DID 10CC)",
    shortName: "LOOP_B",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "10CC",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 215,
  },
  {
    id: "ptm-drive-load",
    ecuId: 236,
    customList: "Thermal & Drive",
    nameEn: "Powertrain Drive Load (2027)",
    nameRu: "Нагрузка привода силовой установки (DID 2027)",
    shortName: "DRV_LD",
    unit: "%",
    protocol: "uds-22",
    addressOrDid: "2027",
    byteIndex: 0,
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 1,
    min: 0,
    max: 100,
  },

  // TCM / CVT 118 (7E1 -> 7E9)
  {
    id: "tcm-atf-temp-uds",
    ecuId: 118,
    customList: "ATM / CVT",
    nameEn: "ATF / CVTF Temperature",
    nameRu: "Температура жидкости вариатора CVTF (DID 103D)",
    shortName: "ATFT",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "103D",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 200,
  },
  {
    id: "tcm-supply-volts",
    ecuId: 118,
    customList: "ATM / CVT",
    nameEn: "TCM Power Supply Voltage",
    nameRu: "Напряжение питания блока TCM (DID 101B)",
    shortName: "TCM_V",
    unit: "В",
    protocol: "uds-22",
    addressOrDid: "101B",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1000,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 20,
  },

  // ABS / VDC / EPB 105 (7B0 -> 7B8)
  {
    id: "abs-brake-pressure",
    ecuId: 105,
    customList: "Sensor Monitor",
    nameEn: "Master Cylinder Brake Pressure (1001)",
    nameRu: "Давление в тормозной магистрали ГТЦ (DID 1001)",
    shortName: "MC_PR",
    unit: "ед.",
    protocol: "uds-22",
    addressOrDid: "1001",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 65535,
  },
  {
    id: "abs-g-sensor",
    ecuId: 105,
    customList: "Sensor Monitor",
    nameEn: "Longitudinal / Lateral G Sensor (1006)",
    nameRu: "Датчик ускорения G-Sensor (DID 1006)",
    shortName: "G_SEN",
    unit: "ед.",
    protocol: "uds-22",
    addressOrDid: "1006",
    byteIndex: 0,
    byteLen: 2,
    signed: true,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: -32768,
    max: 32767,
  },
  {
    id: "abs-epb-force",
    ecuId: 105,
    customList: "Solenoid & EPB",
    nameEn: "EPB Clamp Force (200D)",
    nameRu: "Усилие затяжки электроручника EPB (DID 200D)",
    shortName: "EPB_F",
    unit: "ед.",
    protocol: "uds-22",
    addressOrDid: "200D",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 65535,
  },
  {
    id: "abs-epb-status",
    ecuId: 105,
    customList: "Solenoid & EPB",
    nameEn: "EPB Actuator Status (2012)",
    nameRu: "Статус актуатора электроручника EPB (DID 2012)",
    shortName: "EPB_ST",
    unit: "",
    protocol: "uds-22",
    addressOrDid: "2012",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "abs-epb-counter",
    ecuId: 105,
    customList: "Solenoid & EPB",
    nameEn: "EPB Operation Counter (200A)",
    nameRu: "Счётчик срабатываний электроручника EPB (DID 200A)",
    shortName: "EPB_CNT",
    unit: "цикл",
    protocol: "uds-22",
    addressOrDid: "200A",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 65535,
  },

  // EPS 147 (746 -> 74E)
  {
    id: "eps-steering-angle",
    ecuId: 147,
    customList: "Steering & Angle",
    nameEn: "Steering Wheel Angle (1041)",
    nameRu: "Угол поворота рулевого колеса (DID 1041)",
    shortName: "STR_ANG",
    unit: "°",
    protocol: "uds-22",
    addressOrDid: "1041",
    byteIndex: 0,
    byteLen: 2,
    signed: true,
    mul: 1,
    div: 10,
    offset: 0,
    decimals: 1,
    min: -720,
    max: 720,
  },
  {
    id: "eps-steering-torque",
    ecuId: 147,
    customList: "Steering & Angle",
    nameEn: "Steering Shaft Torque (1006)",
    nameRu: "Крутящий момент на рулевом валу (DID 1006)",
    shortName: "STR_TRQ",
    unit: "ед.",
    protocol: "uds-22",
    addressOrDid: "1006",
    byteIndex: 0,
    byteLen: 2,
    signed: true,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: -32768,
    max: 32767,
  },
  {
    id: "eps-motor-load",
    ecuId: 147,
    customList: "Steering & Angle",
    nameEn: "EPS Assist Load (1007)",
    nameRu: "Нагрузка электроусилителя руля (DID 1007)",
    shortName: "EPS_LD",
    unit: "ед.",
    protocol: "uds-22",
    addressOrDid: "1007",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 65535,
  },

  // BIU / TPMS 170 (752 -> 75A)
  {
    id: "biu-tpms-1",
    ecuId: 170,
    customList: "TPMS",
    nameEn: "Tire Pressure Wheel 1 (1021)",
    nameRu: "Давление в шине 1 (DID 1021)",
    shortName: "TPMS1",
    unit: "кПа",
    protocol: "uds-22",
    addressOrDid: "1021",
    byteIndex: 0,
    byteLen: 1,
    mul: 1379,
    div: 1000,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 350,
  },
  {
    id: "biu-tpms-2",
    ecuId: 170,
    customList: "TPMS",
    nameEn: "Tire Pressure Wheel 2 (1022)",
    nameRu: "Давление в шине 2 (DID 1022)",
    shortName: "TPMS2",
    unit: "кПа",
    protocol: "uds-22",
    addressOrDid: "1022",
    byteIndex: 0,
    byteLen: 1,
    mul: 1379,
    div: 1000,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 350,
  },
  {
    id: "biu-tpms-3",
    ecuId: 170,
    customList: "TPMS",
    nameEn: "Tire Pressure Wheel 3 (1023)",
    nameRu: "Давление в шине 3 (DID 1023)",
    shortName: "TPMS3",
    unit: "кПа",
    protocol: "uds-22",
    addressOrDid: "1023",
    byteIndex: 0,
    byteLen: 1,
    mul: 1379,
    div: 1000,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 350,
  },
  {
    id: "biu-tpms-4",
    ecuId: 170,
    customList: "TPMS",
    nameEn: "Tire Pressure Wheel 4 (1024)",
    nameRu: "Давление в шине 4 (DID 1024)",
    shortName: "TPMS4",
    unit: "кПа",
    protocol: "uds-22",
    addressOrDid: "1024",
    byteIndex: 0,
    byteLen: 1,
    mul: 1379,
    div: 1000,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 350,
  },
  {
    id: "biu-supply-volts",
    ecuId: 170,
    customList: "Body & Power",
    nameEn: "BIU Power Supply Voltage (101B)",
    nameRu: "Напряжение питания боди-модуля BIU (DID 101B)",
    shortName: "BIU_V",
    unit: "В",
    protocol: "uds-22",
    addressOrDid: "101B",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1000,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 20,
  },

  // Combination Meter 165 (783 -> 78B)
  {
    id: "met-fuel-sub-left",
    ecuId: 165,
    customList: "Fuel & Illumination",
    nameEn: "Fuel Level Sensor 1 — Left Tank (1041)",
    nameRu: "Датчик уровня топлива 1 — левый полубак (DID 1041)",
    shortName: "FUEL_L",
    unit: "%",
    protocol: "uds-22",
    addressOrDid: "1041",
    byteIndex: 0,
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 100,
  },
  {
    id: "met-fuel-sub-right",
    ecuId: 165,
    customList: "Fuel & Illumination",
    nameEn: "Fuel Level Sensor 2 — Right Tank (1042)",
    nameRu: "Датчик уровня топлива 2 — правый полубак (DID 1042)",
    shortName: "FUEL_R",
    unit: "%",
    protocol: "uds-22",
    addressOrDid: "1042",
    byteIndex: 0,
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 100,
  },
  {
    id: "met-ambient-temp",
    ecuId: 165,
    customList: "Fuel & Illumination",
    nameEn: "Ambient / Meter Temperature (1007)",
    nameRu: "Наружная температура / датчик приборки (DID 1007)",
    shortName: "AMB_T",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "1007",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 100,
  },
  {
    id: "met-light-sensor",
    ecuId: 165,
    customList: "Fuel & Illumination",
    nameEn: "Ambient Light / Dimmer Sensor (1062)",
    nameRu: "Датчик освещённости / диммер приборки (DID 1062)",
    shortName: "LIGHT",
    unit: "%",
    protocol: "uds-22",
    addressOrDid: "1062",
    byteIndex: 0,
    byteLen: 1,
    mul: 100,
    div: 255,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 100,
  },
  {
    id: "met-supply-volts",
    ecuId: 165,
    customList: "Fuel & Illumination",
    nameEn: "Meter Supply Voltage (101B)",
    nameRu: "Напряжение бортсети на приборке (DID 101B)",
    shortName: "MET_V",
    unit: "В",
    protocol: "uds-22",
    addressOrDid: "101B",
    byteIndex: 0,
    byteLen: 2,
    mul: 1,
    div: 1000,
    offset: 0,
    decimals: 2,
    min: 0,
    max: 20,
  },

  // SRS Airbag 188 (780 -> 788)
  {
    id: "srs-unit-temp",
    ecuId: 188,
    customList: "Squibs & Seatbelts",
    nameEn: "SRS ECU Internal Temperature (1007)",
    nameRu: "Внутренняя температура блока SRS (DID 1007)",
    shortName: "SRS_T",
    unit: "°C",
    protocol: "uds-22",
    addressOrDid: "1007",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: -40,
    decimals: 0,
    min: -40,
    max: 120,
  },
  {
    id: "srs-driver-belt",
    ecuId: 188,
    customList: "Squibs & Seatbelts",
    nameEn: "Driver Seatbelt Buckle Switch (1044)",
    nameRu: "Замок ремня безопасности водителя (DID 1044)",
    shortName: "BELT_D",
    unit: "",
    protocol: "uds-22",
    addressOrDid: "1044",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "srs-passenger-belt",
    ecuId: 188,
    customList: "Squibs & Seatbelts",
    nameEn: "Passenger Seatbelt Buckle Switch (1045)",
    nameRu: "Замок ремня переднего пассажира (DID 1045)",
    shortName: "BELT_P",
    unit: "",
    protocol: "uds-22",
    addressOrDid: "1045",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
  {
    id: "srs-ods-status",
    ecuId: 188,
    customList: "Squibs & Seatbelts",
    nameEn: "Occupant Detection Status (1047)",
    nameRu: "Статус присутствия переднего пассажира ODS (DID 1047)",
    shortName: "ODS",
    unit: "",
    protocol: "uds-22",
    addressOrDid: "1047",
    byteIndex: 0,
    byteLen: 1,
    mul: 1,
    div: 1,
    offset: 0,
    decimals: 0,
    min: 0,
    max: 255,
  },
];

export const SSM4_UTILITIES: readonly Ssm4UtilitySpec[] = [
  {
    id: "util-eps-sas-zero",
    ecuId: 147,
    txHex: "746",
    rxHex: "74E",
    titleRu: "Калибровка и проверка нуля датчика угла поворота руля (EPS / SAS)",
    titleEn: "Steering Angle Sensor Centering & Inspection",
    ssmFunctionCode: "FunctionId = 902 (Utility · EPS 746)",
    purposeRu:
      "Контроль нулевого положения рулевого вала (0.0°), крутящего момента на торсионе и тока ассистента после регулировки схождения или работ по подвеске.",
    conditionsRu: [
      "Автомобиль стоит на ровной горизонтальной площадке, передние колёса выставлены строго прямо.",
      "Зажигание включено (IG ON), рулевое колесо не удерживается руками.",
      "Отклонение угла DID 1041 в покое не должно превышать ±1.5°.",
    ],
    liveDids: [
      { did: "1041", labelRu: "Угол поворота рулевого колеса (°)" },
      { did: "1006", labelRu: "Крутящий момент на рулевом валу" },
      { did: "1007", labelRu: "Нагрузка электроусилителя руля" },
      { did: "101B", labelRu: "Напряжение питания EPS (В)" },
    ],
    safetyNoteRu:
      "В QHub режим работает без отправки разрушающих RoutineControl (0x31): вы контролируете точный угол 0.0° и момент в реальном времени.",
  },
  {
    id: "util-cvt-at-inspection",
    ecuId: 118,
    txHex: "7A2",
    rxHex: "7AA",
    titleRu: "Температурный контроль CVTF и инспекция Lineartronic CVT",
    titleEn: "Lineartronic CVT Fluid Temperature & Learning Inspection",
    ssmFunctionCode: "FunctionId = 902 (Utility · TCM 7E1 / PTM 7A2)",
    purposeRu:
      "Контроль рабочей температуры жидкости вариатора (35–45 °C для выставления уровня CVTF; 65–85 °C для условий адаптации муфты переднего хода и гидроблока).",
    conditionsRu: [
      "Рычаг селектора в положении P, стояночный тормоз включён, двигатель работает на холостом ходу.",
      "Для проверки уровня масла CVTF температура по DID 103D должна находиться в окне 35–45 °C.",
      "Отсутствуют активные коды неисправностей в блоках 7E1 и 7A2.",
    ],
    liveDids: [
      { did: "103D", labelRu: "Температура жидкости КПП / вариатора (103D)" },
      { did: "1297", labelRu: "Температура масла ДВС (1297)" },
      { did: "10CB", labelRu: "Термоконтур охлаждения A (10CB)" },
      { did: "10CC", labelRu: "Термоконтур охлаждения B (10CC)" },
    ],
    safetyNoteRu:
      "Принудительный сброс таблиц обучения вариатора (AT Learning Clear) отключён в браузере, чтобы исключить рывки при незавершённом цикле адаптации.",
  },
  {
    id: "util-epb-brake-service",
    ecuId: 105,
    txHex: "7B0",
    rxHex: "7B8",
    titleRu: "Инспекция электроручника EPB, тормозного давления и G-сенсора (VDC)",
    titleEn: "EPB Clamp Force & VDC Sensor Zero Inspection",
    ssmFunctionCode: "FunctionId = 902 (Utility · Brake Control 7B0)",
    purposeRu:
      "Проверка наработки актуаторов электроручника EPB, усилия затяжки суппортов, давления в главном тормозном цилиндре и нуля датчика ускорения G-Sensor.",
    conditionsRu: [
      "Автомобиль неподвижен на горизонтальной поверхности, зажигание IG ON.",
      "Напряжение аккумулятора не ниже 12.0 В.",
      "При отпущенной педали тормоза давление ГТЦ (DID 1001) должно быть около 0.",
    ],
    liveDids: [
      { did: "1001", labelRu: "Давление в тормозной магистрали (1001)" },
      { did: "1006", labelRu: "Продольное/поперечное ускорение G (1006)" },
      { did: "200D", labelRu: "Усилие затяжки электроручника EPB (200D)" },
      { did: "2012", labelRu: "Статус актуатора электроручника EPB (2012)" },
      { did: "200A", labelRu: "Счётчик циклов EPB (200A)" },
    ],
    safetyNoteRu:
      "Команды разведения колодок и сброса нуля VDC (0x2F / 0x31) заблокированы для защиты тормозной системы.",
  },
  {
    id: "util-eyesight-camera-check",
    ecuId: 203,
    txHex: "787",
    rxHex: "78F",
    titleRu: "Инспекция стереокамеры EyeSight и условий калибровки ADAS",
    titleEn: "EyeSight Camera Inspection & Calibration Readiness",
    ssmFunctionCode: "FunctionId = 902 / Keycode 49232 (EyeSight 787)",
    purposeRu:
      "Чтение версии ПО, калибровочных идентификаторов и диагностических регистров стереокамеры EyeSight перед стендовой/дорожной проверкой.",
    conditionsRu: [
      "Лобовое стекло в зоне стереокамеры чистое, без бликов и посторонних предметов на торпедо.",
      "Давление в шинах соответствует норме (проверка по блоку 752).",
      "Угол руля в прямолинейном положении близок к 0.0°.",
    ],
    liveDids: [
      { did: "F197", labelRu: "Имя системы EyeSight (F197)" },
      { did: "F18E", labelRu: "Каталожный номер камеры (F18E)" },
      { did: "F182", labelRu: "ID калибровки камеры (F182)" },
      { did: "1000", labelRu: "Карта поддерживаемых DID (1000)" },
    ],
    safetyNoteRu:
      "Стереокамера EyeSight относится к системам безопасности: в QHub разрешено только чтение конфигурации и ошибок без стирания.",
  },
  {
    id: "util-tpms-inspection",
    ecuId: 170,
    txHex: "752",
    rxHex: "75A",
    titleRu: "Контроль датчиков давления в шинах TPMS (BIU 752)",
    titleEn: "TPMS Tire Pressure & Sensor Status Check",
    ssmFunctionCode: "FunctionId = 902 (Utility · TPMS 752)",
    purposeRu:
      "Прямое чтение давления всех 4 колёс из боди-модуля BIU (752 → 75A) в барах, кПа и PSI для проверки датчиков после сезонной смены колёс.",
    conditionsRu: [
      "Зажигание включено (IG ON).",
      "Для обновления показаний спящих датчиков может потребоваться короткая поездка со скоростью выше 30 км/ч.",
    ],
    liveDids: [
      { did: "1021", labelRu: "Давление шины 1 (1021)" },
      { did: "1022", labelRu: "Давление шины 2 (1022)" },
      { did: "1023", labelRu: "Давление шины 3 (1023)" },
      { did: "1024", labelRu: "Давление шины 4 (1024)" },
    ],
    safetyNoteRu:
      "Чтение выполняется в безопасном режиме UDS Service 0x22 без перезаписи ID датчиков в EEPROM BIU.",
  },
];

export const SSM4_CUSTOMIZE_ITEMS: readonly Ssm4CustomizeItem[] = [
  {
    id: "cust-biu-101e",
    ecuId: 170,
    txHex: "752",
    rxHex: "75A",
    didHex: "101E",
    nameEn: "IG Counter & Startup Timer",
    nameRu: "Счётчик циклов зажигания и таймер работы BIU",
    categoryRu: "BIU · Персонализация и статус кузова",
    defaultText: "Активен",
    optionsRu: ["Только чтение (Read-Only)"],
    decode: (bytes) => formatUdsPayload([0x10, 0x1e, ...bytes], 0x22, "752"),
  },
  {
    id: "cust-biu-101b",
    ecuId: 170,
    txHex: "752",
    rxHex: "75A",
    didHex: "101B",
    nameEn: "BIU Supply Voltage Threshold Monitor",
    nameRu: "Контроль напряжения питания боди-модуля BIU",
    categoryRu: "BIU · Персонализация и статус кузова",
    defaultText: "12.0–14.5 В",
    optionsRu: ["Норма (11.5–14.8 В)", "Просадка (<11.5 В)"],
    decode: (bytes) => formatUdsPayload([0x10, 0x1b, ...bytes], 0x22, "752"),
  },
  {
    id: "cust-meter-1062",
    ecuId: 165,
    txHex: "783",
    rxHex: "78B",
    didHex: "1062",
    nameEn: "Combination Meter Illumination / Auto Light Sensitivity",
    nameRu: "Чувствительность датчика освещённости и диммера приборки",
    categoryRu: "Combination Meter (783) · Отображение и подсветка",
    defaultText: "Стандарт",
    optionsRu: ["Нормальная", "Пониженная", "Повышенная"],
    decode: (bytes) => formatUdsPayload([0x10, 0x62, ...bytes], 0x22, "783"),
  },
  {
    id: "cust-meter-1041",
    ecuId: 165,
    txHex: "783",
    rxHex: "78B",
    didHex: "1041",
    nameEn: "Fuel Tank Main Sub-Sensor Calibration Reading",
    nameRu: "Калибровочное чтение левого полубака (Meter 1041)",
    categoryRu: "Combination Meter (783) · Отображение и подсветка",
    defaultText: "0–100%",
    optionsRu: ["Чтение уровня %"],
    decode: (bytes) => formatUdsPayload([0x10, 0x41, ...bytes], 0x22, "783"),
  },
  {
    id: "cust-meter-1042",
    ecuId: 165,
    txHex: "783",
    rxHex: "78B",
    didHex: "1042",
    nameEn: "Fuel Tank Sub-Sensor 2 Reading",
    nameRu: "Калибровочное чтение правого полубака (Meter 1042)",
    categoryRu: "Combination Meter (783) · Отображение и подсветка",
    defaultText: "0–100%",
    optionsRu: ["Чтение уровня %"],
    decode: (bytes) => formatUdsPayload([0x10, 0x42, ...bytes], 0x22, "783"),
  },
  {
    id: "cust-eyesight-f182",
    ecuId: 203,
    txHex: "787",
    rxHex: "78F",
    didHex: "F182",
    nameEn: "EyeSight Calibration Data Identifier",
    nameRu: "Идентификатор калибровки и региональных настроек EyeSight",
    categoryRu: "EyeSight (787) · Конфигурация ассистентов",
    defaultText: "Заводская калибровка",
    optionsRu: ["Только чтение (Read-Only)"],
    decode: (bytes) => formatUdsPayload([0xf1, 0x82, ...bytes], 0x22, "787"),
  },
];

export function matchSsm4VehicleByVin(vin: string | null | undefined): Ssm4VehicleModel | null {
  if (!vin) return null;
  const clean = vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 5) return null;
  for (const v of SSM4_VEHICLES) {
    if (v.vinPrefixes.some((prefix) => clean.startsWith(prefix))) {
      return v;
    }
  }
  for (const v of SSM4_VEHICLES) {
    if (v.chassisCodes.some((code) => clean.includes(code))) {
      return v;
    }
  }
  if (clean.startsWith("JF1") || clean.startsWith("JF2") || clean.startsWith("4S3") || clean.startsWith("4S4")) {
    return SSM4_VEHICLES[0]!;
  }
  return null;
}

export function decodeSsm4SignalPayload(
  signal: Ssm4SignalDef,
  payloadAfterSid: number[],
): { text: string; numeric: number | null } | null {
  let data: number[];
  if (signal.protocol === "ssm-a8") {
    // Positive response to A8 00 HH MM LL is E8 <val...> (no address echo)
    data = payloadAfterSid;
  } else if (signal.protocol === "uds-22") {
    // Positive response to 22 DID_HI DID_LO is 62 DID_HI DID_LO <val...>
    if (payloadAfterSid.length < 3) return null;
    data = payloadAfterSid.slice(2);
  } else {
    // Positive response to 01 PID is 41 PID <val...>
    if (payloadAfterSid.length < 2) return null;
    data = payloadAfterSid.slice(1);
  }

  const start = signal.byteIndex ?? 0;
  if (start + signal.byteLen > data.length) return null;

  let raw = 0;
  if (signal.byteLen === 1) {
    raw = data[start]!;
    if (signal.signed && raw >= 0x80) raw -= 0x100;
  } else {
    raw = (data[start]! << 8) | data[start + 1]!;
    if (signal.signed && raw >= 0x8000) raw -= 0x10000;
  }

  if (signal.bitIndex != null) {
    const bitVal = (raw >> signal.bitIndex) & 1;
    const enumText = signal.enums?.[bitVal] ?? (bitVal === 1 ? "ON" : "OFF");
    return { text: enumText, numeric: bitVal };
  }

  if (signal.enums && signal.enums[raw] != null) {
    return { text: signal.enums[raw]!, numeric: raw };
  }

  const scaled = (raw * signal.mul) / signal.div + signal.offset;
  const text = signal.decimals > 0 ? scaled.toFixed(signal.decimals) : String(Math.round(scaled));
  return { text, numeric: Number(scaled.toFixed(Math.max(signal.decimals, 2))) };
}

export function buildSsm4RequestHex(signal: Ssm4SignalDef): {
  serviceSid: number;
  requestHex: string;
} {
  if (signal.protocol === "ssm-a8") {
    const clean = signal.addressOrDid.replace(/[^0-9A-Fa-f]/g, "").padStart(6, "0").toUpperCase();
    return {
      serviceSid: 0xa8,
      requestHex: `A8 00 ${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 6)}`,
    };
  }
  if (signal.protocol === "uds-22") {
    const clean = signal.addressOrDid.replace(/[^0-9A-Fa-f]/g, "").padStart(4, "0").toUpperCase();
    return {
      serviceSid: 0x22,
      requestHex: `22 ${clean}`,
    };
  }
  const clean = signal.addressOrDid.replace(/[^0-9A-Fa-f]/g, "").padStart(2, "0").toUpperCase();
  return {
    serviceSid: 0x01,
    requestHex: `01 ${clean}`,
  };
}

export function summarizeDiscoveredDidBitmap(didNum: number, payloadAfterSid: number[]): number[] {
  if (!isUdsBitmapDid(didNum) || payloadAfterSid.length < 6) return [];
  return decodeUdsDidSupportBitmap(didNum, payloadAfterSid.slice(2, 6));
}

export interface SubaruCanadianPreset {
  id: string;
  modelSeriesRu: string;
  years: string;
  trimRu: string;
  engineRu: string;
  appliedModel: string;
  usOptionCodeExamples: string[];
  canadianOptionCodeC0: string;
  canadianOptionCodeC5: string;
  xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)" | "Single X-Mode (SNOW/DIRT)" | "Без X-Mode (Sedan / Impreza)";
  featuresRu: string;
}

/**
 * Reference catalog of North American (USDM -> Canadian CDM C0/C5) Applied Model + Option Code
 * combinations for the models covered by TSB 07-183-20 (MC-10182242-0001.pdf):
 * - 2020–24 Legacy / Outback (BT9 / BTA / BW)
 * - 2019–24 Forester (SK9)
 * - 2018–24 Crosstrek / XV (GT7 / GTE / GU)
 * - 2017–24 Impreza (GK / GT)
 * - 2019–24 Ascent (WMA)
 *
 * In Subaru's 4-character Option Code (Digits 1–2 = Destination, Digits 3–4 = Equipment Package):
 * - U4 = USA Federal (50-state / Turbo FA24F)
 * - U5 = USA California / PZEV (2.5L / 2.0L NA)
 * - U6 = USA Federal Non-PZEV
 * - C0 = Canada Federal (Metric: °C, km/h, L/100km, TPMS 315 MHz)
 * - C5 = Canada PZEV (Metric: °C, km/h, L/100km, TPMS 315 MHz)
 */
export const SUBARU_CANADIAN_OPTION_PRESETS: readonly SubaruCanadianPreset[] = [
  // 1. Outback BT (2020–2024) — 2.4L Turbo (BTA) & 2.5L NA (BT9)
  {
    id: "bt-outback-wilderness-24t",
    modelSeriesRu: "Outback VI (BT)",
    years: "2022–2024",
    trimRu: "Wilderness 2.4T (как на фото шильдика друга!)",
    engineRu: "FA24F 2.4L Turbo (CVT TR690)",
    appliedModel: "BTACYRB",
    usOptionCodeExamples: ["U45D", "U45C"],
    canadianOptionCodeC0: "C05D",
    canadianOptionCodeC5: "C55D",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Двухрежимный Dual X-Mode, 11.6\" CP1, передняя камера, люк, RAB, BSD/RCTA, метрика Канады (°C, км/ч)",
  },
  {
    id: "bt-outback-onyx-xt-24t",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "Onyx Edition XT / Outdoor XT 2.4T",
    engineRu: "FA24F 2.4L Turbo (CVT TR690)",
    appliedModel: "BTACYHB",
    usOptionCodeExamples: ["U45B", "U45D"],
    canadianOptionCodeC0: "C05B",
    canadianOptionCodeC5: "C55B",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Dual X-Mode (активирует 2 режима X-Mode при выборе кода H/R), StarTex, 11.6\", передняя камера, °C / км/ч",
  },
  {
    id: "bt-outback-limited-xt-24t",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "Limited XT 2.4T",
    engineRu: "FA24F 2.4L Turbo (CVT TR690)",
    appliedModel: "BTACYJB",
    usOptionCodeExamples: ["U47H", "U47Y"],
    canadianOptionCodeC0: "C07H",
    canadianOptionCodeC5: "C57H",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu:
      "Кожа, люк, Harman/Kardon, навигация, DriverFocus DMS, RAB, BSD/RCTA, °C / км/ч",
  },
  {
    id: "bt-outback-touring-xt-24t",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "Touring XT / Premier XT 2.4T",
    engineRu: "FA24F 2.4L Turbo (CVT TR690)",
    appliedModel: "BTACYKB",
    usOptionCodeExamples: ["U48Y", "U49Y"],
    canadianOptionCodeC0: "C08Y",
    canadianOptionCodeC5: "C58Y",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu:
      "Nappa кожа, вентиляция сидений, передняя камера, 11.6\" Navi, Harman/Kardon, люк, °C / км/ч",
  },
  {
    id: "bt-outback-premium-25i",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "2.5i Premium / Convenience / Touring (CA)",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "BT9CYCC",
    usOptionCodeExamples: ["U53B", "U53D", "U53E", "U63D"],
    canadianOptionCodeC0: "C03D",
    canadianOptionCodeC5: "C53D",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu: "11.6\" экран, электропривод багажника PRG, BSD/RCTA, бесключевой доступ, °C / км/ч",
  },
  {
    id: "bt-outback-onyx-25i",
    modelSeriesRu: "Outback VI (BT)",
    years: "2022–2024",
    trimRu: "2.5i Onyx Edition (с Dual X-Mode на 2.5L!)",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "BT9CYTC",
    usOptionCodeExamples: ["U55D", "U65D"],
    canadianOptionCodeC0: "C05D",
    canadianOptionCodeC5: "C55D",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Включает двухрежимный Dual X-Mode на атмосферном моторе 2.5L FB25D + метрику Канады (°C, км/ч)",
  },
  {
    id: "bt-outback-limited-25i",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "2.5i Limited",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "BT9CYDC",
    usOptionCodeExamples: ["U57H", "U57Y", "U67H"],
    canadianOptionCodeC0: "C07H",
    canadianOptionCodeC5: "C57H",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu: "Кожа, Harman/Kardon, люк, RAB, BSD/RCTA, 11.6\", °C / км/ч",
  },
  {
    id: "bt-outback-touring-25i",
    modelSeriesRu: "Outback VI (BT)",
    years: "2020–2024",
    trimRu: "2.5i Touring / Premier (CA)",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "BT9CYEC",
    usOptionCodeExamples: ["U58Y", "U68Y"],
    canadianOptionCodeC0: "C08Y",
    canadianOptionCodeC5: "C58Y",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu: "Максимальная комплектация 2.5L: Nappa, вентиляция, передняя камера, люк, °C / км/ч",
  },

  // 2. Forester SK (2019–2024)
  {
    id: "sk-forester-sport-dual-xmode",
    modelSeriesRu: "Forester V (SK)",
    years: "2019–2024",
    trimRu: "2.5i Sport (с двухрежимным Dual X-Mode)",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "SK9CY5C",
    usOptionCodeExamples: ["U54D", "U54H", "U64D"],
    canadianOptionCodeC0: "C04D",
    canadianOptionCodeC5: "C54D",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Двухрежимный Dual X-Mode, панорамный люк, BSD/RCTA, RAB, SI-Drive Sport#, °C / км/ч",
  },
  {
    id: "sk-forester-wilderness",
    modelSeriesRu: "Forester V (SK)",
    years: "2022–2024",
    trimRu: "2.5i Wilderness",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "SK9CYRC",
    usOptionCodeExamples: ["U45D", "U55D"],
    canadianOptionCodeC0: "C05D",
    canadianOptionCodeC5: "C55D",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Dual X-Mode, передняя камера, 8\" Harman/Kardon, панорамный люк, RAB, °C / км/ч",
  },
  {
    id: "sk-forester-limited-touring",
    modelSeriesRu: "Forester V (SK)",
    years: "2019–2024",
    trimRu: "2.5i Limited / Touring (Premier CA)",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "SK9CY7C",
    usOptionCodeExamples: ["U57H", "U58Y", "U68Y"],
    canadianOptionCodeC0: "C08Y",
    canadianOptionCodeC5: "C58Y",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Dual X-Mode, DriverFocus DMS, кожа, Harman/Kardon, подогрев руля и задних сидений, °C / км/ч",
  },

  // 3. Crosstrek / XV (GT / GU 2018–2024)
  {
    id: "gt-crosstrek-sport-limited-25",
    modelSeriesRu: "Crosstrek / XV (GT / GU)",
    years: "2021–2024",
    trimRu: "2.5i Sport / Outdoor (CA) / Limited",
    engineRu: "FB25D 2.5L DI (CVT TR580)",
    appliedModel: "GTACY7C",
    usOptionCodeExamples: ["U54D", "U57H", "U64D"],
    canadianOptionCodeC0: "C04D",
    canadianOptionCodeC5: "C54D",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Двухрежимный Dual X-Mode (на комплектациях Sport / Outdoor 2.5L), люк, BSD/RCTA, RAB, °C / км/ч",
  },
  {
    id: "gt-crosstrek-premium-20",
    modelSeriesRu: "Crosstrek / XV (GT)",
    years: "2018–2023",
    trimRu: "2.0i Premium / Touring (CA) / Limited",
    engineRu: "FB20D 2.0L DI (CVT TR580)",
    appliedModel: "GT7CY5C",
    usOptionCodeExamples: ["U53D", "U57H"],
    canadianOptionCodeC0: "C03D",
    canadianOptionCodeC5: "C53D",
    xModeTypeRu: "Single X-Mode (SNOW/DIRT)",
    featuresRu: "Однорежимный X-Mode, зимний пакет, EyeSight, BSD/RCTA, °C / км/ч",
  },

  // 4. Ascent WM (2019–2024)
  {
    id: "wm-ascent-limited-touring-onyx",
    modelSeriesRu: "Ascent (WM)",
    years: "2019–2024",
    trimRu: "2.4T Onyx / Limited / Touring (Premier CA)",
    engineRu: "FA24F 2.4L Turbo (CVT TR690)",
    appliedModel: "WMACY7B",
    usOptionCodeExamples: ["U47H", "U48Y", "U45D"],
    canadianOptionCodeC0: "C07H",
    canadianOptionCodeC5: "C57H",
    xModeTypeRu: "Dual X-Mode (SNOW/DIRT + DEEP SNOW/MUD)",
    featuresRu:
      "Dual X-Mode (c 2021MY), 3 ряда, панорама, Harman/Kardon, RAB, передняя камера / 360°, °C / км/ч",
  },

  // 5. Legacy BW (2020–2024) & Impreza GK/GT (2017–2023)
  {
    id: "bw-legacy-limited-xt",
    modelSeriesRu: "Legacy VII (BW)",
    years: "2020–2024",
    trimRu: "2.5i / 2.4T Limited / Touring XT (Premier CA)",
    engineRu: "FB25D 2.5L / FA24F 2.4T",
    appliedModel: "BWACY9B",
    usOptionCodeExamples: ["U47H", "U57H"],
    canadianOptionCodeC0: "C07H",
    canadianOptionCodeC5: "C57H",
    xModeTypeRu: "Без X-Mode (Sedan / Impreza)",
    featuresRu: "Седан: 11.6\" экран, Harman/Kardon, люк, DriverFocus, метрика Канады (°C, км/ч)",
  },
];

export interface SubaruAppliedModelAnalysis {
  appliedModel: string;
  optionCode: string;
  valid: boolean;
  seriesCode: string;
  modelYearChar: string;
  modelYearText: string;
  marketAreaChar: string;
  gradeChar: string;
  gradeDescriptionRu: string;
  drivetrainChar: string;
  optionDestinationPrefix: string;
  optionDestinationRu: string;
  optionEquipmentSuffix: string;
  canadianOptionCodeC0: string;
  canadianOptionCodeC5: string;
  dualXModeAppliedModelSuggestion: string;
}

const SUBARU_OPTION_DEST_MAP: Record<string, string> = {
  U4: "США — Federal 50-State Emissions (USDM: Фаренгейты °F, мили MPH, галлоны)",
  U5: "США — California / PZEV Emissions (USDM: Фаренгейты °F, мили MPH, галлоны)",
  U6: "США — Federal Non-PZEV (USDM: Фаренгейты °F, мили MPH, галлоны)",
  C0: "Канада — Standard Destination (CDM: Цельсии °C, км/ч, л/100км, TPMS 315 МГц)",
  C5: "Канада — PZEV Emissions (CDM: Цельсии °C, км/ч, л/100км, TPMS 315 МГц)",
  C4: "Мексика (метрическая система °C, км/ч)",
  C6: "Южная Корея (метрическая система °C, км/ч)",
  EC: "Европа LHD (EUDM: Цельсии °C, км/ч, TPMS 433 МГц)",
  EA: "СНГ / РФ LHD (Цельсии °C, км/ч)",
  K0: "General Export LHD (Цельсии °C, км/ч)",
};

const SUBARU_OUTBACK_GRADE_MAP: Record<string, string> = {
  B: "Outback 2.5i Base (Single X-Mode)",
  C: "Outback 2.5i Premium / Touring CA (Single X-Mode)",
  D: "Outback 2.5i Limited (Single X-Mode)",
  E: "Outback 2.5i Touring / Premier CA (Single X-Mode)",
  T: "Outback 2.5i Onyx Edition (Dual X-Mode: SNOW/DIRT + DEEP SNOW/MUD)",
  H: "Outback 2.4T Onyx Edition XT / Outdoor XT (Dual X-Mode: SNOW/DIRT + DEEP SNOW/MUD)",
  J: "Outback 2.4T Limited XT (Single X-Mode)",
  K: "Outback 2.4T Touring XT / Premier XT (Single X-Mode)",
  R: "Outback / Forester Wilderness (Dual X-Mode: SNOW/DIRT + DEEP SNOW/MUD)",
  "5": "Sport / Limited (на Forester SK / Crosstrek GT — Dual X-Mode)",
  "7": "Limited / Touring (Dual X-Mode на Forester SK / Crosstrek 2.5)",
};

const SUBARU_MY_CHAR_MAP: Record<string, string> = {
  A: "2020 MY (Revision A)",
  B: "2021 MY (Revision B)",
  C: "2022 MY (Revision C)",
  D: "2023 MY (Revision D)",
  E: "2024 MY (Revision E)",
  F: "2025 MY (Revision F)",
};

/**
 * Decodes the 7-character Applied Model + 4-character Option Code ("12 columns of models")
 * used by SSM4 Combination Meter Variant Work (TSB 07-183-20 / MC-10182242-0001.pdf, Operation Procedure B).
 *
 * Example from user's photo (2022 Outback Wilderness):
 * - Applied Model: BTACYRB (BTA = Outback 2.4T, C = 2022MY, Y = US/Canada SIA, R = Wilderness, B = TR690 CVT)
 * - Option Code:   U45D    (U4 = USA Federal -> replace with C05D or C55D for Canada Metric °C & km/h)
 */
export function decodeSubaruAppliedModel12Columns(
  appliedModelInput: string,
  optionCodeInput: string,
): SubaruAppliedModelAnalysis {
  const app = appliedModelInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const opt = optionCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const valid = app.length === 7 && opt.length === 4;

  const seriesCode = app.slice(0, 3) || "—";
  const modelYearChar = app.slice(3, 4) || "—";
  const marketAreaChar = app.slice(4, 5) || "—";
  const gradeChar = app.slice(5, 6) || "—";
  const drivetrainChar = app.slice(6, 7) || "—";

  const modelYearText = SUBARU_MY_CHAR_MAP[modelYearChar] ?? `Ревизия ${modelYearChar}`;
  const gradeDescriptionRu =
    SUBARU_OUTBACK_GRADE_MAP[gradeChar] ??
    `Комплектация "${gradeChar}" (6-й знак Applied Model)`;

  const optionDestinationPrefix = opt.slice(0, 2) || "—";
  const optionEquipmentSuffix = opt.slice(2, 4) || "—";
  const optionDestinationRu =
    SUBARU_OPTION_DEST_MAP[optionDestinationPrefix] ??
    `Код региона "${optionDestinationPrefix}" (первые 2 символа Option Code)`;

  const canadianOptionCodeC0 =
    opt.length === 4 ? `C0${opt.slice(2, 4)}` : "C05D";
  const canadianOptionCodeC5 =
    opt.length === 4 ? `C5${opt.slice(2, 4)}` : "C55D";

  // Suggest Dual X-Mode grade letter in position 6 if currently Single X-Mode
  let dualGrade = gradeChar;
  if (seriesCode === "BTA" && !["R", "H"].includes(gradeChar)) {
    dualGrade = "R"; // Wilderness / Onyx XT has Dual X-Mode on 2.4T
  } else if (seriesCode === "BT9" && gradeChar !== "T") {
    dualGrade = "T"; // Onyx 2.5i has Dual X-Mode on 2.5L
  } else if (seriesCode.startsWith("SK") && !["5", "7", "R"].includes(gradeChar)) {
    dualGrade = "5"; // Forester Sport / Wilderness has Dual X-Mode
  }
  const dualXModeAppliedModelSuggestion =
    app.length === 7
      ? `${app.slice(0, 5)}${dualGrade}${app.slice(6, 7)}`
      : app;

  return {
    appliedModel: app,
    optionCode: opt,
    valid,
    seriesCode,
    modelYearChar,
    modelYearText,
    marketAreaChar,
    gradeChar,
    gradeDescriptionRu,
    drivetrainChar,
    optionDestinationPrefix,
    optionDestinationRu,
    optionEquipmentSuffix,
    canadianOptionCodeC0,
    canadianOptionCodeC5,
    dualXModeAppliedModelSuggestion,
  };
}

export interface SubaruDumpCodeMatch {
  foundDirectAscii: boolean;
  directAppliedModel: string | null;
  directOptionCode: string | null;
  sourceDid: string | null;
  inferredRegion: "CANADA (C0 / C5 — °C, км/ч)" | "USA (U4 / U5 / U6 — °F, мили)" | "UNKNOWN";
  inferredAppliedModel: string;
  inferredOptionCode: string;
  explanationRu: string;
}

/**
 * Inspects a captured Subaru Meter (783/7C0) & BIU (752) dump and extracts or reconstructs
 * the exact 7-character Applied Model + 4-character Option Code (e.g. BTACYRB + C05D),
 * so the user sees the human-readable code instead of raw hex bytes.
 */
export function extractAppliedModelAndOptionCodeFromDump(
  dump: {
    vin: string | null;
    modules: {
      txHex: string;
      dids: { did: string; label: string; hex: string; decoded: string }[];
    }[];
  },
  fallbackAppliedModel = "BTACYRB",
  fallbackUsOptionCode = "U45D",
): SubaruDumpCodeMatch {
  const appRegex = /\b(BT[9A]|BW[9A]|SK[79]|GT[7A]|GU[7A]|GK[7A]|WMA)[A-Z][YLK5][A-Z0-9]{2}\b/;
  const optRegex = /\b(U4|U5|U6|C0|C5|C4|C6|EC|EA|K0)[A-Z0-9]{2}\b/;

  let directAppliedModel: string | null = null;
  let directOptionCode: string | null = null;
  let sourceDid: string | null = null;

  for (const mod of dump.modules) {
    if (mod.txHex !== "783" && mod.txHex !== "7C0" && mod.txHex !== "752") continue;
    for (const d of mod.dids) {
      const mApp = d.decoded.match(appRegex);
      if (mApp && !directAppliedModel) {
        directAppliedModel = mApp[0];
        sourceDid = `${mod.txHex} DID ${d.did}`;
      }
      const mOpt = d.decoded.match(optRegex);
      if (mOpt && !directOptionCode) {
        directOptionCode = mOpt[0];
        if (!sourceDid) sourceDid = `${mod.txHex} DID ${d.did}`;
      }
    }
  }

  // Also check VIN if available to refine series/year/trim
  let baseApp = directAppliedModel ?? fallbackAppliedModel.trim().toUpperCase();
  if (!directAppliedModel && dump.vin && dump.vin.length === 17) {
    const vin = dump.vin.toUpperCase();
    // 4S4BTGUD2N3... -> pos 4-5 = BT, pos 10 = N (2022 -> C, M=2021->B, P=2023->D, R=2024->E)
    const yearMap: Record<string, string> = { L: "A", M: "B", N: "C", P: "D", R: "E", S: "F" };
    const rev = yearMap[vin[9] ?? ""] ?? baseApp[3] ?? "C";
    if (vin.slice(3, 5) === "BT") {
      const isTurbo = vin[5] === "G" || vin[5] === "A";
      const isWilderness = vin.slice(5, 7) === "GU";
      baseApp = `BT${isTurbo ? "A" : "9"}${rev}Y${isWilderness ? "R" : baseApp[5] ?? "R"}B`;
    }
  }

  const cleanFallbackOpt = fallbackUsOptionCode.trim().toUpperCase();
  const suffix = cleanFallbackOpt.length === 4 ? cleanFallbackOpt.slice(2, 4) : "5D";

  if (directAppliedModel || directOptionCode) {
    const finalOpt = directOptionCode ?? `C0${suffix}`;
    const isCan = finalOpt.startsWith("C0") || finalOpt.startsWith("C5");
    return {
      foundDirectAscii: true,
      directAppliedModel,
      directOptionCode,
      sourceDid,
      inferredRegion: isCan
        ? "CANADA (C0 / C5 — °C, км/ч)"
        : "USA (U4 / U5 / U6 — °F, мили)",
      inferredAppliedModel: baseApp,
      inferredOptionCode: finalOpt,
      explanationRu: `Прямое совпадение ASCII-кода найдено в ответе блока (${sourceDid}): ${baseApp} + ${finalOpt}`,
    };
  }

  // Fallback reconstruction from known B-pillar input + Canadian C0 conversion
  const inferredOpt = `C0${suffix}`;
  return {
    foundDirectAscii: false,
    directAppliedModel: null,
    directOptionCode: null,
    sourceDid: null,
    inferredRegion: "CANADA (C0 / C5 — °C, км/ч)",
    inferredAppliedModel: baseApp,
    inferredOptionCode: inferredOpt,
    explanationRu:
      "Приборка хранит результат ввода 12 columns в виде битовой маски комплектации (без открытой ASCII-строки). По VIN и пакету опций восстановлен эквивалентный канадский код для ввода в SSM4.",
  };
}

