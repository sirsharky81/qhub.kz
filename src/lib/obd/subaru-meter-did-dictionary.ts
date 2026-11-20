import {
  SSM4_CGDW_FINGERPRINTS,
  SSM4_CGDW_FP_DID_KEYS,
} from "./subaru-ssm4-cgdw-fingerprints";

export type SubaruMeterPanelKind =
  | "bt-bw-early"
  | "bt-bw-wm-facelift"
  | "gu-crosstrek"
  | "vb-vn-wrx"
  | "zd8-zn8-brz"
  | "sk-forester"
  | "gk-gt-late"
  | "gk-gt-early";

export interface SubaruMeterPanelProfile {
  kind: SubaruMeterPanelKind;
  titleRu: string;
  modelsRu: string;
  destinationDid: "A001" | "A002";
  activeDids: readonly string[];
}

export type SubaruMeterDidCategory =
  | "region"
  | "adas"
  | "drivetrain"
  | "lighting"
  | "safety"
  | "body"
  | "multimedia"
  | "other";

export type SubaruMeterDidValueKind =
  | "enum"
  | "presence-ff-00"
  | "presence-01-00"
  | "nibble-pair"
  | "reserved";

export interface SubaruMeterDidMeta {
  did: string;
  ssm4NameEn: string;
  cardiagNameEn?: string;
  titleRu: string;
  descriptionRu: string;
  category: SubaruMeterDidCategory;
  valueKind: SubaruMeterDidValueKind;
  editableInUi: boolean;
}

export interface SubaruMeterDidValueOption {
  hex: string;
  labelRu: string;
  inAppliedModel: boolean;
  inPanelKind: boolean;
  examplePairs: string[];
}

export interface SubaruMeterPanelDidSpec {
  meta: SubaruMeterDidMeta;
  supportedOnPanel: boolean;
  liveHex: string | null;
  liveDecoded: string | null;
  options: SubaruMeterDidValueOption[];
}

export const SUBARU_METER_PANEL_PROFILES: Record<
  SubaruMeterPanelKind,
  SubaruMeterPanelProfile
> = {
  "bt-bw-early": {
    kind: "bt-bw-early",
    titleRu: "Outback BT / Legacy BW (2020–2022 MY, дорестайлинг US/CA)",
    modelsRu: "BT9A–C, BTAA–C, BW9A–C, BWAA–C (напр. BTACYR8)",
    destinationDid: "A002",
    activeDids: [
      "A002", "A005", "A006", "A007", "A008", "A009", "A00C", "A00F", "A010",
      "A011", "A014", "A016", "A019", "A021", "A022", "A023", "A024", "A025",
      "A026", "A027", "A028", "A02D", "A034",
    ],
  },
  "bt-bw-wm-facelift": {
    kind: "bt-bw-wm-facelift",
    titleRu: "Outback BT / Legacy BW / Ascent WM (2023–2025 MY и 2022 EU/AU)",
    modelsRu: "BT9D–E, BTAD–E, BW9D–E, BWAD–E, WMAE, BT*C EU/AU",
    destinationDid: "A002",
    activeDids: [
      "A002", "A005", "A006", "A007", "A008", "A009", "A00C", "A00D", "A00F",
      "A010", "A011", "A014", "A016", "A019", "A021", "A022", "A023", "A024",
      "A025", "A026", "A027", "A028", "A02D", "A02E", "A02F", "A034", "A036",
      "A039", "A041",
    ],
  },
  "gu-crosstrek": {
    kind: "gu-crosstrek",
    titleRu: "Crosstrek / Impreza GU (2024+ MY)",
    modelsRu: "GU7A, GU9A, GUEA",
    destinationDid: "A002",
    activeDids: [
      "A002", "A003", "A005", "A006", "A007", "A008", "A009", "A00C", "A00D",
      "A00F", "A010", "A011", "A014", "A016", "A019", "A021", "A022", "A023",
      "A024", "A025", "A026", "A027", "A028", "A02D", "A02F", "A034", "A035",
      "A036", "A039", "A041",
    ],
  },
  "vb-vn-wrx": {
    kind: "vb-vn-wrx",
    titleRu: "WRX VB / Levorg VN (2022+ MY)",
    modelsRu: "VBHB, VBHC, VNHB, VNHC",
    destinationDid: "A002",
    activeDids: [
      "A002", "A005", "A006", "A007", "A008", "A009", "A00C", "A00D", "A00F",
      "A010", "A011", "A014", "A016", "A019", "A021", "A022", "A023", "A024",
      "A025", "A026", "A027", "A028", "A02A", "A02B", "A034",
    ],
  },
  "zd8-zn8-brz": {
    kind: "zd8-zn8-brz",
    titleRu: "BRZ ZD8 / Toyota GR86 ZN8 (2022+ MY)",
    modelsRu: "ZD8A–B, ZN8A–B",
    destinationDid: "A002",
    activeDids: [
      "A002", "A005", "A006", "A009", "A00B", "A00C", "A010", "A011", "A014",
      "A021", "A024", "A025", "A026", "A027", "A028",
    ],
  },
  "sk-forester": {
    kind: "sk-forester",
    titleRu: "Forester SK (2019–2024 MY · SGP Gen1)",
    modelsRu: "SK7A–E, SK9A–E, SKEA–E (напр. 85002SJ120)",
    destinationDid: "A001",
    activeDids: [
      "A001", "A005", "A006", "A007", "A008", "A009", "A00B", "A00C", "A00D",
      "A00F", "A010", "A011", "A012", "A014", "A015", "A019", "A021", "A022",
    ],
  },
  "gk-gt-late": {
    kind: "gk-gt-late",
    titleRu: "Impreza GK / Crosstrek XV GT (2019–2023 MY)",
    modelsRu: "GK2C–F, GK3C–F, GK7C–G, GT2C–F, GT3C–F, GT7B–G, GT9E–G, GTA*, GTE*",
    destinationDid: "A001",
    activeDids: [
      "A001", "A005", "A006", "A007", "A008", "A009", "A00B", "A00C", "A00F",
      "A010", "A011", "A012", "A014", "A015", "A016", "A021",
    ],
  },
  "gk-gt-early": {
    kind: "gk-gt-early",
    titleRu: "Impreza GK / XV GT (2017–2019 MY · ранний SGP)",
    modelsRu: "GK2A–B, GK3A–B, GK7A–B, GT2A–B, GT3A–B, GT7A–B",
    destinationDid: "A001",
    activeDids: [
      "A001", "A005", "A006", "A007", "A008", "A009", "A00A", "A00B", "A00C",
      "A00F", "A010", "A011", "A012", "A013", "A014", "A015", "A016", "A018",
    ],
  },
};

const A001_DEST_MAP: Record<string, string> = {
  "02": "U5 — США (°F, MPH, мили)",
  "03": "C5 — Канада (°C, км/ч, л/100км)",
  "04": "EC / EA / E7 / E3 — Европа LHD и СНГ (°C, км/ч)",
  "05": "E3 / E5 / C4 / K4 — Европа / Мексика (°C, км/ч)",
  "06": "KS — Азия / Export (°C, км/ч)",
  "07": "EK — Европа / Export",
  "08": "KV / KY / ER / EN — GCC / Ближний Восток / Азия",
  "09": "KA — Австралия / Новая Зеландия (°C, км/ч)",
  "0A": "ES / ET — Европа (спец. рынок)",
  "0C": "KC — General / GCC (°C, км/ч)",
};

const A002_DEST_MAP: Record<string, string> = {
  "02": "U4 — США Federal (°F, MPH, мили)",
  "03": "C0 — Канада Standard (°C, км/ч, л/100км)",
  "04": "EC — Европа LHD (°C, км/ч)",
  "05": "U5 — США PZEV (°F, MPH, мили)",
  "06": "C5 — Канада PZEV (°C, км/ч, л/100км)",
  "07": "EK — Европа (EK)",
  "08": "EE / E1 — Европа (EE/E1)",
  "09": "E2 — Европа (E2)",
  "0A": "ES / ET — Европа (ES/ET)",
  "0B": "E7 — Европа (E7)",
  "0C": "EA — СНГ / РФ (°C, км/ч)",
  "0D": "E3 / EB — Европа (E3/EB)",
  "0E": "K4 — Export (K4)",
  "0F": "KS / KG / KR — Азия / Корея",
  "10": "EP — Европа (EP)",
  "11": "ER — Европа (ER)",
  "12": "EN — Европа (EN)",
  "13": "KA — Австралия / НЗ (°C, км/ч)",
  "14": "KV / KY — Ближний Восток / Азия",
  "15": "KV — Ближний Восток (KV)",
  "16": "KC — General / GCC (°C, км/ч)",
  "17": "C4 — Мексика (°C, км/ч)",
  "18": "E9 / KF — Европа / Export",
  "1A": "KP — Export (KP)",
  "1B": "K2 / K8 / KE — Япония / Азия",
  "1C": "E1 / C6 — Южная Корея / E1",
  "1D": "KG — Export (KG)",
  "1E": "E5 — Европа (E5)",
};

const A003_GU_MAP: Record<string, string> = {
  "09": "LHD США / Канада (GU7*Y / GU9*Y)",
  "0A": "RHD Австралия / GCC (GU7AK)",
  "0B": "RHD Великобритания / Export (GUEAK)",
  "0C": "Спец. рынок K4 (GUEAL)",
};

const A016_VEHICLE_TYPE_MAP: Record<string, string> = {
  "00": "4D (SEDAN) — Legacy BW / Impreza 4D / WRX VB",
  "01": "5D (WGN) — Impreza 5D / Crosstrek / Levorg / Ascent",
  "03": "XV (OBK) — Outback BT / Crosstrek XV",
};

const A024_SPEAKER_AMP_MAP: Record<string, string> = {
  "01": "Internal AMP + 4SP (базовая акустика 4 динамика)",
  "02": "Internal AMP + 6SP (штатная система 6 динамиков)",
  "03": "Internal AMP (EU / Premium конфигурация)",
  "04": "External AMP (Harman Kardon)",
  "05": "Coupe 8SP (BRZ / GR86 Premium)",
};

const A027_CAMERA_MAP: Record<string, string> = {
  "00": "Нет камер",
  "01": "Rear Camera (NTSC) — только камера заднего вида",
  "02": "Rear Camera + Front Camera (NTSC) — задняя + передняя",
  "06": "Multi-View (Rear + Front + Side, EU/AU)",
  "07": "360° / Surround Multi-View",
};

const A013_BODY_MAP: Record<string, string> = {
  "00": "Вариант 00 (EU/RHD GT/GK)",
  "02": "Вариант 02 (US/CA/JP GK/GT)",
};

const A035_GU_MAP: Record<string, string> = {
  "00": "Стандарт (US / CA / JP / AU)",
  "02": "Европа / UK RHD (GUEAK)",
};

function decodeA007SixSiDrive(hex: string): string {
  const clean = hex.trim().toUpperCase();
  const hi = clean[0] ?? "0";
  const lo = clean[1] ?? "0";
  const sixMap: Record<string, string> = {
    "0": "No function (нет X-Mode)",
    "1": "2 Modes Function Effective (Dual X-Mode)",
    "2": "2 Modes Function Effective (Sport)",
    "3": "2 Modes Function Effective (Gravel · Wilderness)",
    F: "1 Mode Function Effective (Single X-Mode)",
  };
  const sidMap: Record<string, string> = {
    "0": "No function (нет SI-Drive)",
    "1": "2 modes (I, S)",
    "2": "Sport (WRX)",
    "4": "SI-Drive (режим 4)",
    "5": "3 modes (I, S, S#)",
    A: "WRX/Levorg (режим A)",
    B: "WRX/Levorg 3 modes (B)",
    D: "WRX/Levorg 3 modes (D)",
  };
  const sixTxt = sixMap[hi] ?? `SI-X=${hi}`;
  const sidTxt = sidMap[lo] ?? `SI-Drive=${lo}`;
  return `SI-X: ${sixTxt} · SI-Drive: ${sidTxt}`;
}

function decodeA021SeatBelt(hex: string): string {
  const clean = hex.trim().toUpperCase();
  const hi = clean[0] ?? "0";
  const lo = clean[1] ?? "0";
  const passMap: Record<string, string> = {
    "0": "No function (выкл)",
    "1": "Type 1 (CAN)",
    "2": "Type 2",
    "3": "Type 3 (EU)",
  };
  const rearMap: Record<string, string> = {
    "0": "No function (выкл)",
    "1": "Type 1 (Occupant Detection on All Rear Seats)",
    "2": "Type 2 (2 задних места / купе)",
    "3": "Type 3",
    "4": "Type 4 (2023+ / EU)",
    "5": "Type 5 (3 ряда, Ascent)",
  };
  return `Пассажир: ${passMap[hi] ?? hi} · Задний ряд: ${rearMap[lo] ?? lo}`;
}

export const SUBARU_METER_A0XX_META_LIST: readonly SubaruMeterDidMeta[] = [
  {
    did: "A001",
    ssm4NameEn: "Act place information (SGP Gen1)",
    cardiagNameEn: "Act place",
    titleRu: "Регион / Destination (SK, GT, GK)",
    descriptionRu:
      "Код рынка и единиц измерения для SGP Gen1 (Forester SK, Crosstrek GT, Impreza GK). На BT/BW/GU/VB/ZD не используется (--).",
    category: "region",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A002",
    ssm4NameEn: "Act place information",
    titleRu: "Регион / Destination и единицы шкал (Act place)",
    descriptionRu:
      "Главный регистр рынка для Outback BT, Legacy BW, Ascent WM, Crosstrek GU, WRX VB, BRZ ZD8: задаёт °F/MPH vs °C/км/ч/л/100км. Не путать с A011 (TPMS).",
    category: "region",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A003",
    ssm4NameEn: "Model / Scale Region (GU)",
    titleRu: "Региональный индекс шкалы (GU)",
    descriptionRu: "Используется на Crosstrek/Impreza GU 2024+ MY (LHD US/CA vs RHD AU/UK).",
    category: "region",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A004",
    ssm4NameEn: "Reserved (mHZ)",
    titleRu: "Резервный DID (A004)",
    descriptionRu: "В каталоге cgdw всегда отсутствует (--).",
    category: "other",
    valueKind: "reserved",
    editableInUi: false,
  },
  {
    did: "A005",
    ssm4NameEn: "Eyesight presence information",
    cardiagNameEn: "EyeSight",
    titleRu: "Наличие EyeSight",
    descriptionRu: "Включает/отключает отображение и связь приборки со стереокамерой EyeSight.",
    category: "adas",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A006",
    ssm4NameEn: "RADAR ASSY B&S presence information",
    cardiagNameEn: "RADAR ASSY B&S",
    titleRu: "Задний/боковой радар BSD / RCTA",
    descriptionRu: "Наличие системы мониторинга слепых зон BSD/SRVD и RCTA в приборке.",
    category: "adas",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A007",
    ssm4NameEn: "SI-X / SI-Drive presence information",
    cardiagNameEn: "SI-X / SI-Drive",
    titleRu: "Режимы X-Mode (SI-X) и SI-Drive",
    descriptionRu:
      "Двухсоставной байт: старший полубайт задаёт X-Mode (0=нет, F=1 режим, 1/2=Dual, 3=Wilderness Gravel), младший — SI-Drive (0=нет, 1=I/S, 5=I/S/S#).",
    category: "drivetrain",
    valueKind: "nibble-pair",
    editableInUi: true,
  },
  {
    did: "A008",
    ssm4NameEn: "Auto start & stop presence information",
    cardiagNameEn: "Auto Start&Stop",
    titleRu: "Система Auto Start-Stop (ISS)",
    descriptionRu: "Наличие индикации и счётчика системы старт-стоп двигателя.",
    category: "drivetrain",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A009",
    ssm4NameEn: "Autoleveler presence information",
    cardiagNameEn: "Autoleveler",
    titleRu: "Автокорректор фар (Autoleveler)",
    descriptionRu: "Наличие автоматического корректора угла наклона фар.",
    category: "lighting",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A00A",
    ssm4NameEn: "Variant Flag (GK/GT early)",
    titleRu: "Вариантный флаг GK/GT (A00A)",
    descriptionRu: "Используется только на ранних Impreza GK / XV GT (2017–2019 MY).",
    category: "other",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A00B",
    ssm4NameEn: "AVN (HU) Equipment",
    cardiagNameEn: "AVN (HU) Equipment",
    titleRu: "Штатное ГУ (AVN / Head Unit)",
    descriptionRu: "Наличие штатной мультимедиа AVN на шине (SK, GT, GK, BRZ/GR86).",
    category: "multimedia",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A00C",
    ssm4NameEn: "LED headlamp presence information",
    cardiagNameEn: "LED Headlight",
    titleRu: "Светодиодные фары (LED Headlamp)",
    descriptionRu: "Наличие светодиодных головных фар (отличает LED от галогена).",
    category: "lighting",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A00D",
    ssm4NameEn: "Rear DIFF temperature",
    cardiagNameEn: "Rear DIFF temperature",
    titleRu: "Контроль температуры заднего дифференциала",
    descriptionRu: "Предупреждение/индикация перегрева заднего дифференциала (SK, GU, VB, BT рестайл/AU).",
    category: "drivetrain",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A00E",
    ssm4NameEn: "Reserved (cgdw)",
    titleRu: "Резервный DID (A00E)",
    descriptionRu: "В каталоге cgdw всегда отсутствует (--), отсутствует в карте mHZ.",
    category: "other",
    valueKind: "reserved",
    editableInUi: false,
  },
  {
    did: "A00F",
    ssm4NameEn: "Gear shift up indicator presence information",
    cardiagNameEn: "Gear shift up indicator",
    titleRu: "Подсказка переключения передачи вверх (GSI)",
    descriptionRu: "Стрелка рекомендации переключения на повышенную передачу (обычно МКПП или EU/GCC).",
    category: "drivetrain",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A010",
    ssm4NameEn: "Warning-BOX presence information",
    cardiagNameEn: "Warning-BOX",
    titleRu: "Окно предупреждений (Warning-BOX)",
    descriptionRu: "Отображение всплывающего окна предупреждений на дисплее приборки.",
    category: "safety",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A011",
    ssm4NameEn: "TPMS presence information",
    cardiagNameEn: "TPMS",
    titleRu: "TPMS (контроль давления в шинах)",
    descriptionRu:
      "Включает (FF) или отключает (00) экран и ошибку TPMS в приборке. Канадские C0/C5 для BT/BW/SK/GT с завода ставят 00 (TPMS нет); чтобы сохранить TPMS при переводе на °C, оставляйте FF!",
    category: "safety",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A012",
    ssm4NameEn: "Pedestrian Airbag",
    cardiagNameEn: "Pedestrian Airbag",
    titleRu: "Подушка безопасности пешехода",
    descriptionRu: "Наличие системы защиты пешехода Pedestrian Airbag (SK, GT, GK).",
    category: "safety",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A013",
    ssm4NameEn: "Body / Market Spec (GK/GT early)",
    titleRu: "Вариантный регистр GK/GT (A013)",
    descriptionRu: "Используется на ранних GK/GT (00 vs 02).",
    category: "body",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A014",
    ssm4NameEn: "SRH presence information",
    cardiagNameEn: "SRH",
    titleRu: "Поворотные фары (SRH)",
    descriptionRu: "Steering Responsive Headlights — подсветка поворотов головными фарами.",
    category: "lighting",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A015",
    ssm4NameEn: "MFD",
    cardiagNameEn: "MFD",
    titleRu: "Верхний дисплей MFD (Upper Grade)",
    descriptionRu: "Тип/наличие верхнего многофункционального дисплея на Forester SK / GT / GK.",
    category: "multimedia",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A016",
    ssm4NameEn: "Vehicle Type information",
    cardiagNameEn: "Vehicle Type",
    titleRu: "Тип кузова (Vehicle Type)",
    descriptionRu: "Силуэт и профиль кузова: 00 = 4D Sedan, 01 = 5D WGN, 03 = XV / Outback.",
    category: "body",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A017",
    ssm4NameEn: "Reserved (mHZ)",
    titleRu: "Резервный DID (A017)",
    descriptionRu: "В каталоге cgdw всегда отсутствует (--).",
    category: "other",
    valueKind: "reserved",
    editableInUi: false,
  },
  {
    did: "A018",
    ssm4NameEn: "Equipment Flag (GK early)",
    titleRu: "Оснащение GK (A018)",
    descriptionRu: "Используется только на ранних Impreza GK / XV GT (00 / FF).",
    category: "other",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A019",
    ssm4NameEn: "Driver Monitoring System Presence Information",
    cardiagNameEn: "DMS",
    titleRu: "Система контроля водителя (DMS / DriverFocus)",
    descriptionRu: "Камера слежения за усталостью/взглядом водителя DriverFocus (Limited/Touring).",
    category: "adas",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A021",
    ssm4NameEn: "Passenger / Rear Seat Belt Warning Specification",
    cardiagNameEn: "Rear Seat Belt Warning",
    titleRu: "Предупреждение о ремнях (передний пассажир + задний ряд)",
    descriptionRu:
      "Двухсоставной байт: старший полубайт — передний пассажир (1=Type 1 CAN, 3=EU), младший — задние сиденья (0=выкл, 1=Type 1 Occupant Detection, 2=купе, 4=2023+/EU, 5=3 ряда).",
    category: "safety",
    valueKind: "nibble-pair",
    editableInUi: true,
  },
  {
    did: "A022",
    ssm4NameEn: "EAM presence information",
    cardiagNameEn: "EAM",
    titleRu: "Модуль EAM (EAM presence)",
    descriptionRu: "Наличие блока/функции EAM в конфигурации приборки.",
    category: "other",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A023",
    ssm4NameEn: "Electric door mirror information",
    titleRu: "Электроскладывание зеркал",
    descriptionRu: "Наличие функции автоматического складывания боковых зеркал (Touring / EU).",
    category: "body",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A024",
    ssm4NameEn: "Speaker and AMP Information",
    titleRu: "Аудиосистема и усилитель (Speaker & AMP)",
    descriptionRu: "Тип аудиосистемы: 01 = 4 дин., 02 = Internal AMP + 6SP, 03 = EU/Premium, 04 = External AMP (Harman Kardon).",
    category: "multimedia",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A025",
    ssm4NameEn: "SXM Antenna Presence Information",
    titleRu: "Антенна SiriusXM (SXM)",
    descriptionRu: "Наличие антенны спутникового радио SiriusXM (FF = Yes в США/Канаде, 00 = No в Европе/Азии).",
    category: "multimedia",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A026",
    ssm4NameEn: "DAB Antenna Presence Information",
    titleRu: "Антенна цифрового радио (DAB)",
    descriptionRu: "Наличие антенны DAB (FF = Yes в Европе/Австралии, 00 = No в США/Канаде).",
    category: "multimedia",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A027",
    ssm4NameEn: "Camera System Information",
    titleRu: "Система камер обзора (Camera System)",
    descriptionRu: "00 = нет, 01 = Rear Camera, 02 = Rear + Front Camera (NTSC), 06 = Multi-View EU/AU, 07 = 360°.",
    category: "adas",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A028",
    ssm4NameEn: "DCM Function Presence Information",
    titleRu: "Телематика DCM (Starlink)",
    descriptionRu: "Наличие блока телематики DCM (01 = Function effective, 00 = No function).",
    category: "multimedia",
    valueKind: "presence-01-00",
    editableInUi: true,
  },
  {
    did: "A02A",
    ssm4NameEn: "Grade / Equipment Spec (VB/VN)",
    titleRu: "Спецификация комплектации VB/VN (A02A)",
    descriptionRu: "Только WRX VB / Levorg VN (00 = стандарт, FF = верхняя комплектация tS/GT-S).",
    category: "body",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A02B",
    ssm4NameEn: "Platform Spec (VB/VN)",
    titleRu: "Платформа VB/VN (A02B)",
    descriptionRu: "Только WRX VB / Levorg VN (константа 01).",
    category: "other",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A02D",
    ssm4NameEn: "Vehicle Grade Presence Information",
    titleRu: "Версия кузова / грейд (WILDERNESS)",
    descriptionRu: "01 = WILDERNESS (особый логотип/грейд на BT/GU), 00 = стандартная версия.",
    category: "body",
    valueKind: "presence-01-00",
    editableInUi: true,
  },
  {
    did: "A02E",
    ssm4NameEn: "Model Revision Flag (MY23 BT / WM)",
    titleRu: "Ревизия поколения MY23 / WM (A02E)",
    descriptionRu: "Различает 2023 MY (00) от 2024 MY (--) на BT/BW, а также Ascent WM (FF).",
    category: "other",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A02F",
    ssm4NameEn: "Touring / Premier Equipment Flag",
    titleRu: "Пакет Touring / Premier (A02F)",
    descriptionRu: "На моделях MY23+ и EU/AU: FF на Touring/Premier, 00 на остальных комплектациях.",
    category: "body",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A034",
    ssm4NameEn: "Regional / RHD Flag (A034)",
    titleRu: "Региональный флаг LHD/RHD (A034)",
    descriptionRu: "На BT/BW/WM/VB = 00; на праворульных RHD GU (AU/UK) = FF.",
    category: "region",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A035",
    ssm4NameEn: "Regional Variant (GU)",
    titleRu: "Региональный индекс GU (A035)",
    descriptionRu: "Только Crosstrek/Impreza GU: 00 = US/CA/JP/AU, 02 = Европа UK RHD.",
    category: "region",
    valueKind: "enum",
    editableInUi: true,
  },
  {
    did: "A036",
    ssm4NameEn: "Option Package Flag (MY23+)",
    titleRu: "Пакет опций MY23+ (A036)",
    descriptionRu: "Отличает старшие пакеты MY23+ (напр. U4TD/C0RF с беспроводной зарядкой = FF, базовые U45D/C0QF = 00).",
    category: "body",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A037",
    ssm4NameEn: "Reserved (mHZ)",
    titleRu: "Резервный DID (A037)",
    descriptionRu: "В каталоге cgdw всегда отсутствует (--).",
    category: "other",
    valueKind: "reserved",
    editableInUi: false,
  },
  {
    did: "A039",
    ssm4NameEn: "Trim Comfort Package Flag (MY23+)",
    titleRu: "Пакет оснащения Base vs Upper (A039)",
    descriptionRu: "На MY23+: 00 на базовых/GCC комплектациях, FF на Premium/Limited/Touring/Wilderness.",
    category: "body",
    valueKind: "presence-ff-00",
    editableInUi: true,
  },
  {
    did: "A041",
    ssm4NameEn: "Platform MY23+ Flag (A041)",
    titleRu: "Маркер поколения MY23+ (A041)",
    descriptionRu: "На моделях MY23+ (BT*D/E, BW*D/E, WM*E, GU) равен FF.",
    category: "other",
    valueKind: "enum",
    editableInUi: true,
  },
];

export const SUBARU_METER_A0XX_META_MAP: Record<string, SubaruMeterDidMeta> = Object.fromEntries(
  SUBARU_METER_A0XX_META_LIST.map((item) => [item.did, item]),
);

export const SUBARU_METER_PANEL_PROFILE_LIST: readonly SubaruMeterPanelProfile[] =
  Object.values(SUBARU_METER_PANEL_PROFILES);

const FP_KEY_INDEX: Record<string, number> = Object.fromEntries(
  SSM4_CGDW_FP_DID_KEYS.map((k, idx) => [k, idx]),
);

function getFpByte(fp: string, did: string): string {
  const idx = FP_KEY_INDEX[did];
  if (idx == null) return "--";
  return fp.slice(idx * 2, idx * 2 + 2) || "--";
}

export function classifyCgdwRowPanelKind(appliedModel: string, fp: string): SubaruMeterPanelKind {
  const app = appliedModel.trim().toUpperCase();
  if (app.startsWith("GU")) return "gu-crosstrek";
  if (app.startsWith("VB") || app.startsWith("VN")) return "vb-vn-wrx";
  if (app.startsWith("ZD") || app.startsWith("ZN")) return "zd8-zn8-brz";
  if (app.startsWith("SK")) return "sk-forester";
  if (app.startsWith("GK") || app.startsWith("GT")) {
    if (getFpByte(fp, "A013") !== "--" || getFpByte(fp, "A018") !== "--") {
      return "gk-gt-early";
    }
    return "gk-gt-late";
  }
  if (app.startsWith("WM")) return "bt-bw-wm-facelift";
  // BT / BW: facelift / MY23+ / EU-AU use A036 / A02F / A039 / A041 / A00D
  if (
    getFpByte(fp, "A036") !== "--" ||
    getFpByte(fp, "A02F") !== "--" ||
    getFpByte(fp, "A041") !== "--"
  ) {
    return "bt-bw-wm-facelift";
  }
  return "bt-bw-early";
}

export interface SubaruMeterCgdwModelBinding {
  appliedModel: string;
  panelKind: SubaruMeterPanelKind;
  rowCount: number;
  optionCodes: string[];
  activeDids: string[];
  activeDidSet: ReadonlySet<string>;
  byDidValues: ReadonlyMap<string, ReadonlySet<string>>;
}

let modelBindingCache: Map<string, SubaruMeterCgdwModelBinding> | null = null;

function getModelBindingMap(): Map<string, SubaruMeterCgdwModelBinding> {
  if (modelBindingCache) return modelBindingCache;

  const grouped = new Map<
    string,
    {
      panelKind: SubaruMeterPanelKind;
      rowCount: number;
      optionCodes: string[];
      activeDidSet: Set<string>;
      byDidValues: Map<string, Set<string>>;
    }
  >();

  for (const row of SSM4_CGDW_FINGERPRINTS) {
    const app = row.appliedModel.trim().toUpperCase();
    let entry = grouped.get(app);
    if (!entry) {
      entry = {
        panelKind: classifyCgdwRowPanelKind(app, row.fp),
        rowCount: 0,
        optionCodes: [],
        activeDidSet: new Set<string>(),
        byDidValues: new Map<string, Set<string>>(),
      };
      grouped.set(app, entry);
    }
    entry.rowCount += 1;
    if (!entry.optionCodes.includes(row.optionCode)) {
      entry.optionCodes.push(row.optionCode);
    }
    for (const did of SSM4_CGDW_FP_DID_KEYS) {
      const b = getFpByte(row.fp, did);
      if (b === "--") continue;
      entry.activeDidSet.add(did);
      let vals = entry.byDidValues.get(did);
      if (!vals) {
        vals = new Set<string>();
        entry.byDidValues.set(did, vals);
      }
      vals.add(b);
    }
  }

  const out = new Map<string, SubaruMeterCgdwModelBinding>();
  for (const [appliedModel, g] of grouped.entries()) {
    const activeDids = SSM4_CGDW_FP_DID_KEYS.filter((d) => g.activeDidSet.has(d));
    out.set(appliedModel, {
      appliedModel,
      panelKind: g.panelKind,
      rowCount: g.rowCount,
      optionCodes: g.optionCodes,
      activeDids,
      activeDidSet: g.activeDidSet,
      byDidValues: g.byDidValues,
    });
  }
  modelBindingCache = out;
  return out;
}

/**
 * Returns the exact cgdw catalog binding (panel family, active DIDs, and allowed byte values)
 * for a specific 7-character Applied Model code, or `null` if that code is not in cgdw.
 */
export function getSubaruMeterCgdwModelBinding(
  appliedModel: string | null | undefined,
): SubaruMeterCgdwModelBinding | null {
  const clean = (appliedModel ?? "").trim().toUpperCase();
  if (!clean) return null;
  return getModelBindingMap().get(clean) ?? null;
}

/**
 * Determines the meter panel kind from the live ECU readback (`Applied Model` + active A0xx DIDs).
 * Prefers exact `cgdw` Model Code bindings when consistent with live ECU DIDs.
 */
export function detectSubaruMeterPanelKind(input: {
  appliedModel?: string | null;
  activeDids?: readonly string[];
}): {
  panelKind: SubaruMeterPanelKind;
  profile: SubaruMeterPanelProfile;
  detectedBy: string;
  strictModelBinding: boolean;
} {
  const activeSet = new Set(
    (input.activeDids ?? []).map((d) => d.trim().toUpperCase()),
  );
  const app = (input.appliedModel ?? "").trim().toUpperCase();
  const modelBinding = getSubaruMeterCgdwModelBinding(app);

  if (modelBinding) {
    const destDid = SUBARU_METER_PANEL_PROFILES[modelBinding.panelKind].destinationDid;
    const liveMatchesDest =
      activeSet.size === 0 ||
      activeSet.has(destDid) ||
      (!activeSet.has("A001") && !activeSet.has("A002"));
    if (liveMatchesDest) {
      return {
        panelKind: modelBinding.panelKind,
        profile: SUBARU_METER_PANEL_PROFILES[modelBinding.panelKind],
        detectedBy:
          activeSet.size > 0
            ? `справочник cgdw (${modelBinding.appliedModel}) + считывание 783`
            : `справочник cgdw (${modelBinding.appliedModel})`,
        strictModelBinding: true,
      };
    }
  }

  // Check explicit hardware signals from active DIDs when exact cgdw binding is absent or conflicts
  if (activeSet.has("A003") || activeSet.has("A035")) {
    return {
      panelKind: "gu-crosstrek",
      profile: SUBARU_METER_PANEL_PROFILES["gu-crosstrek"],
      detectedBy: "активный DID A003/A035 (GU)",
      strictModelBinding: false,
    };
  }
  if (activeSet.has("A02A") || activeSet.has("A02B")) {
    return {
      panelKind: "vb-vn-wrx",
      profile: SUBARU_METER_PANEL_PROFILES["vb-vn-wrx"],
      detectedBy: "активный DID A02A/A02B (WRX/Levorg)",
      strictModelBinding: false,
    };
  }
  if (activeSet.has("A001")) {
    if (activeSet.has("A013") || activeSet.has("A018") || activeSet.has("A00A")) {
      return {
        panelKind: "gk-gt-early",
        profile: SUBARU_METER_PANEL_PROFILES["gk-gt-early"],
        detectedBy: "A001 + A013/A018 (ранний GK/GT)",
        strictModelBinding: false,
      };
    }
    if (activeSet.has("A019") || activeSet.has("A022") || activeSet.has("A00D")) {
      return {
        panelKind: "sk-forester",
        profile: SUBARU_METER_PANEL_PROFILES["sk-forester"],
        detectedBy: "A001 + A019/A022 (Forester SK)",
        strictModelBinding: false,
      };
    }
    if (app.startsWith("SK")) {
      return {
        panelKind: "sk-forester",
        profile: SUBARU_METER_PANEL_PROFILES["sk-forester"],
        detectedBy: `Applied Model ${app}`,
        strictModelBinding: false,
      };
    }
    return {
      panelKind: "gk-gt-late",
      profile: SUBARU_METER_PANEL_PROFILES["gk-gt-late"],
      detectedBy: "A001 + A021 (GK/GT 2019–2023)",
      strictModelBinding: false,
    };
  }
  if (activeSet.has("A002")) {
    if (
      activeSet.has("A036") ||
      activeSet.has("A02F") ||
      activeSet.has("A039") ||
      activeSet.has("A041")
    ) {
      return {
        panelKind: "bt-bw-wm-facelift",
        profile: SUBARU_METER_PANEL_PROFILES["bt-bw-wm-facelift"],
        detectedBy: "A002 + A02F/A036/A041 (BT/BW/WM рестайл)",
        strictModelBinding: false,
      };
    }
    if (activeSet.has("A00B") && !activeSet.has("A019") && !activeSet.has("A023")) {
      return {
        panelKind: "zd8-zn8-brz",
        profile: SUBARU_METER_PANEL_PROFILES["zd8-zn8-brz"],
        detectedBy: "A002 + A00B без A023 (BRZ/GR86)",
        strictModelBinding: false,
      };
    }
    if (app.startsWith("GU")) {
      return {
        panelKind: "gu-crosstrek",
        profile: SUBARU_METER_PANEL_PROFILES["gu-crosstrek"],
        detectedBy: `Applied Model ${app}`,
        strictModelBinding: false,
      };
    }
    if (app.startsWith("VB") || app.startsWith("VN")) {
      return {
        panelKind: "vb-vn-wrx",
        profile: SUBARU_METER_PANEL_PROFILES["vb-vn-wrx"],
        detectedBy: `Applied Model ${app}`,
        strictModelBinding: false,
      };
    }
    if (app.startsWith("ZD") || app.startsWith("ZN")) {
      return {
        panelKind: "zd8-zn8-brz",
        profile: SUBARU_METER_PANEL_PROFILES["zd8-zn8-brz"],
        detectedBy: `Applied Model ${app}`,
        strictModelBinding: false,
      };
    }
    return {
      panelKind: "bt-bw-early",
      profile: SUBARU_METER_PANEL_PROFILES["bt-bw-early"],
      detectedBy: "A002 без A036 (BT/BW 2020–2022)",
      strictModelBinding: false,
    };
  }

  // Fallback purely by Applied Model prefix
  if (app.startsWith("GU")) {
    return {
      panelKind: "gu-crosstrek",
      profile: SUBARU_METER_PANEL_PROFILES["gu-crosstrek"],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  if (app.startsWith("VB") || app.startsWith("VN")) {
    return {
      panelKind: "vb-vn-wrx",
      profile: SUBARU_METER_PANEL_PROFILES["vb-vn-wrx"],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  if (app.startsWith("ZD") || app.startsWith("ZN")) {
    return {
      panelKind: "zd8-zn8-brz",
      profile: SUBARU_METER_PANEL_PROFILES["zd8-zn8-brz"],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  if (app.startsWith("SK")) {
    return {
      panelKind: "sk-forester",
      profile: SUBARU_METER_PANEL_PROFILES["sk-forester"],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  if (app.startsWith("GK") || app.startsWith("GT")) {
    const rev = app[3] ?? "C";
    const kind: SubaruMeterPanelKind =
      rev === "A" || rev === "B" || rev === "R" ? "gk-gt-early" : "gk-gt-late";
    return {
      panelKind: kind,
      profile: SUBARU_METER_PANEL_PROFILES[kind],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  if (app.startsWith("WM") || (app.startsWith("BT") || app.startsWith("BW")) && (app[3] === "D" || app[3] === "E" || app[3] === "F")) {
    return {
      panelKind: "bt-bw-wm-facelift",
      profile: SUBARU_METER_PANEL_PROFILES["bt-bw-wm-facelift"],
      detectedBy: `Applied Model ${app}`,
      strictModelBinding: false,
    };
  }
  return {
    panelKind: "bt-bw-early",
    profile: SUBARU_METER_PANEL_PROFILES["bt-bw-early"],
    detectedBy: app ? `Applied Model ${app}` : "не выбрано (считайте приборку или выберите вручную)",
    strictModelBinding: false,
  };
}

export function decodeSubaruMeterA0xxByte(
  did: string,
  hexByte: string,
  panelKind?: SubaruMeterPanelKind,
): string {
  const cleanDid = did.trim().toUpperCase();
  const cleanHex = hexByte.trim().toUpperCase().slice(0, 2);
  if (!cleanHex || cleanHex === "--") return "Отсутствует (--)";
  const meta = SUBARU_METER_A0XX_META_MAP[cleanDid];

  if (cleanDid === "A001") {
    return A001_DEST_MAP[cleanHex] ?? `Регион 0x${cleanHex}`;
  }
  if (cleanDid === "A002") {
    return A002_DEST_MAP[cleanHex] ?? `Регион 0x${cleanHex}`;
  }
  if (cleanDid === "A003") {
    return A003_GU_MAP[cleanHex] ?? `Индекс GU 0x${cleanHex}`;
  }
  if (cleanDid === "A007") {
    return decodeA007SixSiDrive(cleanHex);
  }
  if (cleanDid === "A011") {
    if (cleanHex === "FF") return "Function effective (TPMS включён)";
    if (cleanHex === "00") return "No function (TPMS выключен)";
    return `Значение 0x${cleanHex}`;
  }
  if (cleanDid === "A013") {
    return A013_BODY_MAP[cleanHex] ?? `Спецификация 0x${cleanHex}`;
  }
  if (cleanDid === "A016") {
    return A016_VEHICLE_TYPE_MAP[cleanHex] ?? `Тип кузова 0x${cleanHex}`;
  }
  if (cleanDid === "A021") {
    return decodeA021SeatBelt(cleanHex);
  }
  if (cleanDid === "A024") {
    return A024_SPEAKER_AMP_MAP[cleanHex] ?? `Аудио 0x${cleanHex}`;
  }
  if (cleanDid === "A025") {
    if (cleanHex === "FF") return "Yes (антенна SXM есть)";
    if (cleanHex === "00") return "No (без антенны SXM)";
  }
  if (cleanDid === "A026") {
    if (cleanHex === "FF") return "Yes (антенна DAB есть)";
    if (cleanHex === "00") return "No (без антенны DAB)";
  }
  if (cleanDid === "A027") {
    return A027_CAMERA_MAP[cleanHex] ?? `Камеры 0x${cleanHex}`;
  }
  if (cleanDid === "A028") {
    if (cleanHex === "01") return "Function effective (DCM/Starlink есть)";
    if (cleanHex === "00") return "No function (без DCM)";
  }
  if (cleanDid === "A02D") {
    if (cleanHex === "01") return "WILDERNESS";
    if (cleanHex === "00") return "Стандартная версия (не Wilderness)";
  }
  if (cleanDid === "A035") {
    return A035_GU_MAP[cleanHex] ?? `Вариант GU 0x${cleanHex}`;
  }
  if (cleanDid === "A005") {
    if (cleanHex === "FF") return "Present (EyeSight включён)";
    if (cleanHex === "00") return "No function (без EyeSight)";
  }
  if (cleanDid === "A02F") {
    if (cleanHex === "FF") return "Touring / Premier (включено)";
    if (cleanHex === "00") return "Стандартные комплектации";
  }
  if (cleanDid === "A036") {
    if (cleanHex === "FF") return "Расширенный пакет (напр. U4TD/C0RF)";
    if (cleanHex === "00") return "Базовый пакет (напр. U45D/C0QF)";
  }
  if (cleanDid === "A039") {
    if (cleanHex === "FF") return "Верхние комплектации (FF)";
    if (cleanHex === "00") return "Базовые / GCC комплектации (00)";
  }
  if (meta?.valueKind === "presence-ff-00") {
    if (cleanHex === "FF") return "Function effective / Enabled (FF)";
    if (cleanHex === "00") return "No function / Disabled (00)";
  }
  if (meta?.valueKind === "presence-01-00") {
    if (cleanHex === "01") return "Function effective / Enabled (01)";
    if (cleanHex === "00") return "No function / Disabled (00)";
  }
  if (panelKind === "vb-vn-wrx" && cleanDid === "A02B" && cleanHex === "01") {
    return "WRX / Levorg (01)";
  }
  return `0x${cleanHex}`;
}

interface PanelCgdwStats {
  byDid: Map<string, Map<string, string[]>>;
}

const panelStatsCache = new Map<SubaruMeterPanelKind, PanelCgdwStats>();

function getPanelCgdwStats(panelKind: SubaruMeterPanelKind): PanelCgdwStats {
  const cached = panelStatsCache.get(panelKind);
  if (cached) return cached;

  const byDid = new Map<string, Map<string, string[]>>();
  for (const row of SSM4_CGDW_FINGERPRINTS) {
    if (classifyCgdwRowPanelKind(row.appliedModel, row.fp) !== panelKind) continue;
    for (const did of SSM4_CGDW_FP_DID_KEYS) {
      const byteHex = getFpByte(row.fp, did);
      if (byteHex === "--") continue;
      let valMap = byDid.get(did);
      if (!valMap) {
        valMap = new Map<string, string[]>();
        byDid.set(did, valMap);
      }
      let examples = valMap.get(byteHex);
      if (!examples) {
        examples = [];
        valMap.set(byteHex, examples);
      }
      if (examples.length < 3) {
        examples.push(`${row.appliedModel}+${row.optionCode}`);
      }
    }
  }
  const stats = { byDid };
  panelStatsCache.set(panelKind, stats);
  return stats;
}

export function getMeterPanelDidSpecList(options: {
  panelKind: SubaruMeterPanelKind;
  appliedModel?: string | null;
  liveDidMap?: Record<string, string>;
  includeAllCatalogDids?: boolean;
  /**
   * When true (default), if `appliedModel` has an exact `cgdw` catalog entry matching `panelKind`,
   * restrict DIDs and allowed byte values strictly to that Model Code (plus any live ECU byte).
   */
  strictToModelCode?: boolean;
}): SubaruMeterPanelDidSpec[] {
  const profile = SUBARU_METER_PANEL_PROFILES[options.panelKind];
  const profileSet = new Set(profile.activeDids);
  const cleanApp = (options.appliedModel ?? "").trim().toUpperCase();
  const hasLiveMap = options.liveDidMap != null;
  const liveMap = options.liveDidMap ?? {};
  const panelStats = getPanelCgdwStats(options.panelKind);

  const modelBinding = getSubaruMeterCgdwModelBinding(cleanApp);
  const isStrictModelActive =
    options.strictToModelCode !== false &&
    modelBinding != null &&
    modelBinding.panelKind === options.panelKind;

  const out: SubaruMeterPanelDidSpec[] = [];
  for (const meta of SUBARU_METER_A0XX_META_LIST) {
    const rawLive = liveMap[meta.did]?.trim().toUpperCase() ?? null;
    const liveByte =
      rawLive && rawLive !== "--" && /^[0-9A-F]{2}/.test(rawLive)
        ? rawLive.slice(0, 2)
        : rawLive === "--"
          ? "--"
          : null;
    const isLiveActive = liveByte != null && liveByte !== "--";
    const supportedOnPanel = isStrictModelActive
      ? hasLiveMap
        ? isLiveActive
        : modelBinding.activeDidSet.has(meta.did)
      : hasLiveMap
        ? isLiveActive
        : profileSet.has(meta.did);

    if (!options.includeAllCatalogDids && !supportedOnPanel) continue;

    const panelValMap = panelStats.byDid.get(meta.did);
    const appValSet = modelBinding?.byDidValues.get(meta.did) ?? new Set<string>();

    const allBytes = new Set<string>();
    if (isStrictModelActive && appValSet.size > 0) {
      for (const b of appValSet) allBytes.add(b);
      if (isLiveActive && liveByte) allBytes.add(liveByte);
    } else {
      if (panelValMap) {
        for (const b of panelValMap.keys()) allBytes.add(b);
      }
      for (const b of appValSet) allBytes.add(b);
      if (isLiveActive && liveByte) allBytes.add(liveByte);

      // For boolean presence DIDs in non-strict mode, ensure both states are selectable
      if (supportedOnPanel && meta.valueKind === "presence-ff-00") {
        allBytes.add("FF");
        allBytes.add("00");
      } else if (supportedOnPanel && meta.valueKind === "presence-01-00") {
        allBytes.add("01");
        allBytes.add("00");
      }
    }

    const optList: SubaruMeterDidValueOption[] = [...allBytes]
      .sort((a, b) => {
        const aApp = appValSet.has(a) ? 0 : 1;
        const bApp = appValSet.has(b) ? 0 : 1;
        if (aApp !== bApp) return aApp - bApp;
        return a.localeCompare(b);
      })
      .map((hex) => ({
        hex,
        labelRu: decodeSubaruMeterA0xxByte(meta.did, hex, options.panelKind),
        inAppliedModel: appValSet.has(hex),
        inPanelKind: panelValMap?.has(hex) ?? false,
        examplePairs: panelValMap?.get(hex) ?? [],
      }));

    out.push({
      meta,
      supportedOnPanel,
      liveHex: liveByte,
      liveDecoded:
        liveByte == null
          ? null
          : liveByte === "--"
            ? "Отсутствует (--)"
            : decodeSubaruMeterA0xxByte(meta.did, liveByte, options.panelKind),
      options: optList,
    });
  }

  return out;
}
