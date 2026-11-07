/**
 * Mitsubishi MUT-III SE Service Procedures, Calibrations, Learned Value Resets, and Actuator Tests.
 *
 * Every procedure is strictly bound to the exact SKEY (and/or `.exdf` family) of the diagnosed vehicle's ECU
 * from `C:\MUTSW_SE\MUT3_SE\DiagDB\DiagCommon.exdf`, `DiagSystem.exdf`, and `Ecu/*.exdf`, verified against
 * `MutDiag.dll` (`MUT3SE.MutDiag.MutDiagDataAccess`).
 *
 * A procedure will NEVER be shown or executed for a vehicle/ECU whose catalog SKEY does not support it.
 */

export type MitsubishiServicePackageId =
  | "transmission"
  | "engine"
  | "brakes_chassis"
  | "meter_body";

export type MitsubishiProcedureKind =
  | "reset"
  | "calibration"
  | "learning"
  | "actuator"
  | "injector_read";

export interface MitsubishiServiceProcedure {
  id: string;
  /** Official MUT-III SE Function ID (`fid` in `DiagCommon.exdf` / `DiagLangH.exdf`). */
  fid: number;
  packageId: MitsubishiServicePackageId;
  kind: MitsubishiProcedureKind;
  /** Target CAN transmit address in uppercase hex (e.g. `"7E1"`, `"7E0"`, `"784"`, `"610"`, `"7B6"`, `"6A0"`, `"620"`). */
  txCanId: string;
  /** Target CAN receive address in uppercase hex (e.g. `"7E9"`, `"7E8"`, `"785"`, `"611"`, `"7B7"`, `"514"`, `"504"`). */
  rxCanId: string;
  /** Diagnostic session command (`"1092"` for MMC KWP-CAN, `"1003"` for UDS). */
  sessionHex: "1092" | "1003";
  /** Primary request frame (`31 xx`, `30 xx 07 xx`, `21 BF`, etc.). */
  startRequest: string;
  /** Optional status poll frame (`30 xx 01`, `32 xx`, `33 xx`, `21 xx`). */
  pollRequest?: string;
  /** Optional stop/release frame (`30 xx 00`, `32 xx`, `31 14 01`). */
  stopRequest?: string;
  /** Optional readback verification frame (`21 0E`, `21 0D`, `21 20`, `21 BC`, etc.). */
  verifyReadRequest?: string;
  /** Duration in ms to hold actuator/learning before sending `stopRequest` (default 3000ms when `stopRequest` is set). */
  holdMs?: number;
  nameRu: string;
  nameEn: string;
  /** Detailed explanation of what the function does and when to use it. */
  descriptionRu: string;
  /** Mandatory safety preconditions displayed to the user before execution. */
  preconditionsRu: string;
  /** Exact MUT-III SE SKEYs (`<skey sid="...">`) that support this procedure. */
  supportedSkeys: readonly string[];
}

export interface MitsubishiServiceExecutionResult {
  procedureId: string;
  nameRu: string;
  skey: string;
  txHex: string;
  rxHex: string;
  success: boolean;
  steps: string[];
  beforeHex?: string | null;
  afterHex?: string | null;
  decodedSummary?: string | null;
}

const SKEYS_CVT_JF016E = ["30022101", "22100"] as const;
const SKEYS_CVT_JF011E = ["30014401", "30014402", "14400", "30020301", "20300"] as const;
const SKEYS_CVT_JF015E = ["30003301", "30003302", "30003303", "30003304", "3300"] as const;
const SKEYS_CVT_ALL = [...SKEYS_CVT_JF016E, ...SKEYS_CVT_JF011E, ...SKEYS_CVT_JF015E] as const;

const SKEYS_AT8_AND_6AT = [
  "30024501", "30024502", "30024503", "30024504", "30024505", "30024506", "24500",
  "30027801", "30027802", "30027803", "30027804", "27800",
  "30028301", "30028302", "30028303", "28300",
  "30029101", "30029102", "30029103", "30029104", "29100",
  "30022901", "30022902", "30022903", "30022904", "30022905", "30022906", "22900",
  "30011301", "30011302", "11300",
  "30002401", "2400", "30002501", "2500", "30002601", "30002602", "2600",
  "30002701", "30002702", "30002703", "30002704", "30002705", "30002706", "30002707", "30002708", "30002709", "2700",
  "30002801", "2800", "30009601", "9600", "30010301", "10300",
] as const;

const SKEYS_DIESEL_4N1_4D56 = [
  "10011701", "10011702", "10011703", "10011704", "15411704", "11700",
  "10003601", "10003602", "10003603", "10003604", "10003605", "10003606", "10003607", "10003608", "10003609", "10003610",
  "12603607", "12603609", "12603610", "12603611", "13803609", "13803610", "3600",
  "12622502", "13322502", "13322503", "22500",
] as const;

const SKEYS_DIESEL_DPF = [
  "10011703", "10011704", "15411704", "11700",
  "12603607", "12603609", "12603610", "12603611", "13803609", "13803610",
  "12622502", "22500",
] as const;

const SKEYS_GAS_RESET = [
  "10022701", "22700",
  "10020201", "20200",
  "10014201", "14200",
  "10027901", "10027902", "27900",
  "10021701", "21700",
  "10025601", "25600",
  "10029801", "10029802", "10029803", "60029801", "60029803", "29800",
  "10005001", "10005002", "10005003", "10005004", "60005001", "60005002", "60005003", "60005004", "5000",
  "10004901", "60004901", "4900",
  "10004101", "10004102", "60004101", "4100",
  "10003101", "60003101", "3100",
  "10007201", "7200",
] as const;

const SKEYS_GAS_STARTER = [
  "10014201", "14200",
  "10020201", "20200",
  "10027901", "10027902", "27900",
  "10022701", "22700",
] as const;

const SKEYS_GAS_BATT_CAL = [
  "10022701", "22700",
  "10004901", "4900",
  "10005003", "5000",
  "10025601", "25600",
  "10029801", "10029802", "10029803", "29800",
] as const;

const SKEYS_ASC_CALIBRATION = [
  "90422301", "90422302", "90422303", "90422304", "90422305", "22300",
  "90020600", "90020601", "90020602", "90020603", "90020604", "90020605", "90020606", "20600",
  "90402301", "90402302", "90402303", "90402304", "90402305", "90402306", "90402307", "90402308", "2300",
  "90402201", "90402202", "90402203", "90402204", "90402205", "2200",
  "90409801", "90409802", "90409803", "9800",
  "90414701", "94814701", "14700",
  "90416001", "90416002", "90416003", "90416004", "90416005", "16000",
  "90424701", "90424702", "90424703", "90424704", "24700",
  "90426901", "90426902", "90426903", "26900",
  "90328401", "90428401", "90428402", "28400",
  "90429901", "29900",
  "3980002", "39800",
  "4400001", "4400002", "44000",
  "90322201", "90322202", "90322203", "22200",
] as const;

const SKEYS_EPB = [
  "420024001", "420024002", "24000",
  "420026301", "26300",
  "5010001", "50100",
] as const;

const SKEYS_AWC = [
  "484212401", "12400",
  "844116201", "16200",
  "840026801", "840026802", "26800",
] as const;

const SKEYS_METER_6A0 = [
  "436227401", "436227402", "27400",
  "437930101", "30100",
  "430015201", "15200",
  "430016701", "430016702", "16700",
  "430021101", "21100",
  "430021501", "21500",
  "430022401", "22400",
  "434412201", "434412202", "434412203", "434412204", "434412205", "434412206", "12200",
  "430006201", "430006202", "430006203", "430006204", "430006205", "430006206", "6200",
] as const;

const SKEYS_ETACS_HS = [
  "226626201", "226626202", "226626203", "226626204", "26200",
  "596626201", "596626202", "596626203", "596626204", "597326201",
  "286826201", "286826202", "286826203", "286826204",
  "367026201", "367026202", "367026203", "367026204",
  "220027501", "220027502", "220027503", "220027504", "220027505", "220027506", "220027508", "27500",
  "590027501", "590027502", "590027503", "590027504", "590027505", "590027506", "590027508",
  "340727501", "340727502", "340727503", "340727504", "340727505", "340727506", "340727508",
  "360727501", "360727502", "360727503", "360727504", "360727505", "360727506", "360727508",
  "597827501", "597827503", "597827504", "597827506",
  "220016501", "220016502", "220016503", "220016504", "220016505", "220016506", "220016507", "220016508", "16500",
  "590016501", "590016502", "590016503", "590016504", "590016505", "590016506", "590016507", "590016508",
  "281116501", "281116502", "281116503", "281116504", "281116505", "281116506", "281116507", "281116508",
  "360716504", "360716505", "360716506", "360716507", "360716508",
] as const;

const SKEYS_ETACS_CUSTOM_RESET = [
  ...SKEYS_ETACS_HS,
  "220015001", "220015002", "220015003", "220015004", "220015005", "220015006", "220015007", "220015008",
  "220015009", "220015010", "220015011", "220015012", "220015013", "220015014", "220015015", "220015016", "15000", "1500",
  "590015001", "590015002", "590015003", "590015004", "590015005", "590015006", "590015007", "590015008",
  "590015009", "590015010", "590015011", "590015013",
  "220020901", "220020902", "220020903", "220020904", "20900",
  "226626401", "226626402", "226626403", "226626404", "226626405", "226626406", "226626407", "226626408", "26400",
  "596626401", "596626402", "596626403", "596626404", "596626405", "596626406", "596626407", "596626408",
  "220004601", "220004602", "220004603", "220004604", "220004605", "220004606", "220004607", "220004608",
  "220004609", "220004610", "220004611", "220004612", "220004613", "220004614", "220004615", "220004616", "220004617", "4600",
] as const;

export const MITSUBISHI_SERVICE_PROCEDURES: readonly MitsubishiServiceProcedure[] = [
  // ============================================================================
  // ПАКЕТ 1: АКПП / Вариатор CVT (7E1 -> 7E9)
  // ============================================================================
  {
    id: "cvt_oil_degradation_reset_jf016e",
    fid: 61408,
    packageId: "transmission",
    kind: "reset",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "3103",
    verifyReadRequest: "210E",
    nameRu: "Сброс счётчика старения масла CVT (Clear CVTF degradation · JF016E/JF017E)",
    nameEn: "Clear CVT oil degradation level (CVT8 JF016E/JF017E)",
    descriptionRu:
      "Обнуляет счётчик термической деградации масла вариатора (31 03, проверка по 21 0E bytePos 28..31). Выполняется обязательно после замены жидкости CVTF-J4, чтобы снять сервисное ограничение давления и крутящего момента.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН (0 об/мин), селектор в положении P, стояночный тормоз включён.",
    supportedSkeys: SKEYS_CVT_JF016E,
  },
  {
    id: "cvt_oil_degradation_reset_jf011e",
    fid: 61408,
    packageId: "transmission",
    kind: "reset",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "3103",
    verifyReadRequest: "210D",
    nameRu: "Сброс счётчика старения масла CVT (Clear CVTF degradation · JF011E/JF015E)",
    nameEn: "Clear CVT oil degradation level (JF011E/JF015E)",
    descriptionRu:
      "Обнуляет счётчик термической деградации масла вариатора (31 03, проверка по 21 0D bytePos 2..5). Выполняется обязательно после замены жидкости CVTF-J1/J4.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН (0 об/мин), селектор в положении P.",
    supportedSkeys: [...SKEYS_CVT_JF011E, ...SKEYS_CVT_JF015E],
  },
  {
    id: "at_learned_value_reset",
    fid: 68308,
    packageId: "transmission",
    kind: "reset",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "30F00701",
    verifyReadRequest: "2120",
    nameRu: "Сброс адаптаций АКПП (Learned value reset · 8AT / 6AT / 5AT)",
    nameEn: "AT Learned value reset",
    descriptionRu:
      "Сбрасывает накопленные топливно-фрикционные адаптации переключений передач АКПП (30 F0 07 01, контроль статуса 21 20). Применяется после полной замены ATF, ремонта гидроблока или при толчках переключения.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН (0 об/мин), селектор в положении P, педаль газа отпущена.",
    supportedSkeys: SKEYS_AT8_AND_6AT,
  },
  {
    id: "cvt_learning_reset_jf016e",
    fid: 50108,
    packageId: "transmission",
    kind: "reset",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "3111",
    nameRu: "Сброс адаптаций регулятора давления CVT (Control learning value reset)",
    nameEn: "CVT Control learning value reset",
    descriptionRu:
      "Сбрасывает адаптивные поправки клапанов управления давлением вариатора CVT8 (31 11). Выполняется после ремонта гидроблока или замены вариатора.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН, селектор в положении P.",
    supportedSkeys: SKEYS_CVT_JF016E,
  },
  {
    id: "cvt_calibration_g_sensor_jf011e",
    fid: 65908,
    packageId: "transmission",
    kind: "calibration",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "3104",
    verifyReadRequest: "2104",
    nameRu: "Калибровка датчика продольного ускорения G-Sensor в CVT",
    nameEn: "CVT G sensor calibration",
    descriptionRu:
      "Калибрует нулевую точку встроенного датчика продольного наклона/ускорения вариатора (31 04, статус в 21 04). Необходима после замены блока TCM или работ с подвеской.",
    preconditionsRu: "Автомобиль на строго горизонтальной ровной площадке, селектор в P, двигатель ЗАГЛУШЕН, зажигание ВКЛ, автомобиль неподвижен.",
    supportedSkeys: SKEYS_CVT_JF011E,
  },
  {
    id: "cvt_eop_air_bleeding",
    fid: 68508,
    packageId: "transmission",
    kind: "actuator",
    txCanId: "7E1",
    rxCanId: "7E9",
    sessionHex: "1092",
    startRequest: "301107",
    pollRequest: "301101",
    stopRequest: "301100",
    verifyReadRequest: "2104",
    holdMs: 3500,
    nameRu: "Прокачка электрического маслонасоса вариатора (Electric oil pump air bleeding)",
    nameEn: "Electric oil pump air bleeding",
    descriptionRu:
      "Принудительно включает электрический масляный насос вариатора (30 11 07 -> 30 11 01 -> 30 11 00) для удаления воздуха из магистрали после замены масла CVTF или электронасоса на комплектациях с AS&G.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН, селектор в P, уровень масла в вариаторе залит по норме.",
    supportedSkeys: SKEYS_CVT_ALL,
  },

  // ============================================================================
  // ПАКЕТ 2: Двигатель Дизель 4N15/4N14/4D56 и Бензин (7E0 -> 7E8)
  // ============================================================================
  {
    id: "diesel_injector_id_readout",
    fid: 4608,
    packageId: "engine",
    kind: "injector_read",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "21BF",
    nameRu: "Чтение прописанных кодов форсунок цилиндров 1–4 (Injector ID Readout · 21 BF)",
    nameEn: "Injector ID Readout",
    descriptionRu:
      "Считывает из ЭБУ дизельного двигателя (4N15 / 4N14 / 4D56) четыре 15-значных калибровочных кода форсунок по 60-байтовому регистру 21 BF (цил. 1: байты 2..16, цил. 2: 17..31, цил. 3: 32..46, цил. 4: 47..61).",
    preconditionsRu: "Зажигание ВКЛ (ON).",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "diesel_oil_exchange_reset",
    fid: 63808,
    packageId: "engine",
    kind: "reset",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "30540700",
    verifyReadRequest: "2117",
    nameRu: "Сброс разжижения моторного масла после ТО (Engine oil exchange service · 30 54 07 00)",
    nameEn: "Engine oil exchange service",
    descriptionRu:
      "Обнуляет в ЭБУ дизельного двигателя (4N15 / 4N14 / 4D56 с DPF) расчётный счётчик разжижения моторного масла дизельным топливом (30 54 07 00, проверка по 21 17). Обязательна при каждой замене масла, иначе ЭБУ зажжёт предупреждение о превышении уровня масла.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН (0 об/мин).",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "diesel_supply_pump_init",
    fid: 63808,
    packageId: "engine",
    kind: "reset",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "30360700",
    pollRequest: "303601",
    verifyReadRequest: "214C",
    nameRu: "Инициализация ТНВД и клапана SCV (Supply pump exchange service · 30 36 07 00)",
    nameEn: "Supply pump exchange service",
    descriptionRu:
      "Сбрасывает адаптации насоса высокого давления (ТНВД) и регулятора давления топлива SCV (30 36 07 00 -> 30 36 01, контроль по 21 4C). Выполняется после замены клапана SCV, ТНВД или чистки топливной системы.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "diesel_small_injection_learning",
    fid: 61308,
    packageId: "engine",
    kind: "learning",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "303707FF",
    pollRequest: "303701",
    stopRequest: "303700",
    verifyReadRequest: "21BE",
    holdMs: 3000,
    nameRu: "Обучение малому впрыску форсунок (Small Injection Quantity Learning · 30 37 07 FF)",
    nameEn: "Small Injection qt. Learning",
    descriptionRu:
      "Запускает цикл калибровки малого (пилотного) впрыска дизельных форсунок (30 37 07 FF -> 30 37 01). Устраняет жёсткую работу («стрекот») дизеля 4N15/4D56 и обязательна после замены форсунок или сброса ТНВД.",
    preconditionsRu: "Двигатель ПРОГРЕТ (ОЖ 75–95 °C) и работает на холостом ходу, селектор в P/N, кондиционер и все электропотребители ВЫКЛЮЧЕНЫ.",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "diesel_fuel_leakage_check",
    fid: 61208,
    packageId: "engine",
    kind: "actuator",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "303507FF",
    pollRequest: "303501",
    stopRequest: "303500",
    verifyReadRequest: "214C",
    holdMs: 4000,
    nameRu: "Опрессовка топливной рампы на утечки (Fuel leakage check · 30 35 07 FF)",
    nameEn: "Fuel leakage check",
    descriptionRu:
      "Принудительно поднимает давление топлива в рампе Common Rail на холостом ходу (30 35 07 FF -> 30 35 01 -> 30 35 00, контроль давления по 21 4C) для проверки герметичности трубок, ТНВД и обратки форсунок.",
    preconditionsRu: "Двигатель запущен на холостом ходу, селектор в P/N, стояночный тормоз затянут.",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "diesel_dpf_service_reset",
    fid: 63808,
    packageId: "engine",
    kind: "reset",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "30530700",
    verifyReadRequest: "2113",
    nameRu: "Сброс блокировки системы сажевого фильтра (DPF system malfunction service · 30 53 07 00)",
    nameEn: "DPF system malfunction service",
    descriptionRu:
      "Сбрасывает сервисный флаг аварийного режима сажевого фильтра DPF после устранения неисправности или чистки/замены DPF (30 53 07 00, контроль сажи в 21 13).",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_DIESEL_DPF,
  },
  {
    id: "diesel_battery_current_sensor_cal",
    fid: 61308,
    packageId: "engine",
    kind: "calibration",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "303907FF",
    pollRequest: "303901",
    stopRequest: "303900",
    verifyReadRequest: "2124",
    holdMs: 2000,
    nameRu: "Калибровка нуля датчика тока АКБ (Battery Current 0-point Learning · Дизель)",
    nameEn: "Battery Current 0 point Learning",
    descriptionRu:
      "Калибрует нулевую точку датчика тока на минусовой клемме АКБ (30 39 07 FF -> 30 39 01 -> 30 39 00) для корректной работы интеллектуальной зарядки генератора и системы Start-Stop.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН, фары, печка, подогревы и все потребители ВЫКЛЮЧЕНЫ.",
    supportedSkeys: SKEYS_DIESEL_4N1_4D56,
  },
  {
    id: "gas_learned_value_reset",
    fid: 3408,
    packageId: "engine",
    kind: "reset",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "310100",
    nameRu: "Сброс всех адаптаций бензинового ДВС (All learned value reset · Топливо / Дроссель / ХХ)",
    nameEn: "All learned value reset (Gasoline Engine)",
    descriptionRu:
      "Обнуляет долгосрочные топливные коррекции (LTFT), адаптации дроссельной заслонки, холостого хода и детонации (31 01 00). Выполняется после чистки дроссельной заслонки, замены свечей, ДМРВ/ДАД или промывки форсунок.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН (0 об/мин), педаль газа отпущена.",
    supportedSkeys: SKEYS_GAS_RESET,
  },
  {
    id: "gas_battery_current_sensor_cal",
    fid: 50408,
    packageId: "engine",
    kind: "calibration",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "310B",
    verifyReadRequest: "211B",
    nameRu: "Калибровка датчика тока АКБ (Battery current sensor calibration · Бензин)",
    nameEn: "Battery current sensor calibration",
    descriptionRu:
      "Калибрует нулевую точку датчика тока АКБ на бензиновых двигателях (31 0B, проверка 21 1B). Выполняется после замены аккумулятора или датчика тока.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН, все электропотребители (фары, климат, обогревы) ВЫКЛЮЧЕНЫ.",
    supportedSkeys: SKEYS_GAS_BATT_CAL,
  },
  {
    id: "gas_fuel_pump_drive",
    fid: 7608,
    packageId: "engine",
    kind: "actuator",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "30110701",
    pollRequest: "301101",
    stopRequest: "301100",
    holdMs: 3500,
    nameRu: "Тест включения топливного насоса на 3.5 сек (Fuel Pump Drive · 30 11 07 01)",
    nameEn: "Fuel Pump Continuous Drive",
    descriptionRu:
      "Принудительно включает реле топливного насоса (30 11 07 01 -> 30 11 01 -> 30 11 00) при заглушенном двигателе для проверки работы насоса и создания давления в рампе после замены топливного фильтра.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_GAS_RESET,
  },
  {
    id: "gas_starter_counter_reset",
    fid: 69208,
    packageId: "engine",
    kind: "reset",
    txCanId: "7E0",
    rxCanId: "7E8",
    sessionHex: "1092",
    startRequest: "310E0200000000",
    verifyReadRequest: "212A",
    nameRu: "Инициализация (сброс) счётчика срабатываний стартера (Starter counter initialization)",
    nameEn: "Starter counter initialization",
    descriptionRu:
      "Сбрасывает счётчик пусков стартера в ЭБУ двигателя (31 0E 02 00 00 00 00, чтение счётчика по 21 2A) после замены стартера.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_GAS_STARTER,
  },

  // ============================================================================
  // ПАКЕТ 3: Тормоза ABS / ASC (784 -> 785), Электроручник EPB (610 -> 611) и S-AWC (7B6 -> 7B7)
  // ============================================================================
  {
    id: "asc_all_sensor_calibration",
    fid: 65908,
    packageId: "brakes_chassis",
    kind: "calibration",
    txCanId: "784",
    rxCanId: "785",
    sessionHex: "1092",
    startRequest: "3130",
    verifyReadRequest: "2102",
    nameRu: "Калибровка всех датчиков курсовой устойчивости ASC (G-Sensor / Yaw Rate / Pressure · 31 30)",
    nameEn: "ASC All sensor calibration",
    descriptionRu:
      "Калибрует нулевые точки датчиков продольного и поперечного ускорения (G-sensor), скорости рыскания (Yaw Rate) и тормозного давления в блоке ABS/ASC (31 30, проверка по 21 02). Выполняется после сход-развала, ремонта рулевого управления или замены блока ASC.",
    preconditionsRu: "Автомобиль на ровной горизонтальной площадке, руль строго прямо (0°), селектор в P/N, педаль тормоза НЕ нажата, двигатель ЗАГЛУШЕН, зажигание ВКЛ.",
    supportedSkeys: SKEYS_ASC_CALIBRATION,
  },
  {
    id: "asc_sas_calibration",
    fid: 65908,
    packageId: "brakes_chassis",
    kind: "calibration",
    txCanId: "784",
    rxCanId: "785",
    sessionHex: "1092",
    startRequest: "3134",
    verifyReadRequest: "2102",
    nameRu: "Калибровка нуля датчика угла руля внутри блока ABS/ASC (SAS calibration · 31 34)",
    nameEn: "ASC SAS calibration",
    descriptionRu:
      "Записывает текущее прямолинейное положение рулевого колеса как 0.0° непосредственно в блоке курсовой устойчивости ABS/ASC (31 34, контроль угла по 21 02).",
    preconditionsRu: "Передние колёса и руль выставлены строго прямо, автомобиль на ровной площадке, зажигание ВКЛ.",
    supportedSkeys: SKEYS_ASC_CALIBRATION,
  },
  {
    id: "epb_full_release_lining_change",
    fid: 48,
    packageId: "brakes_chassis",
    kind: "actuator",
    txCanId: "610",
    rxCanId: "611",
    sessionHex: "1092",
    startRequest: "30120700",
    pollRequest: "301201",
    holdMs: 3000,
    nameRu: "Сервисный режим замены задних колодок EPB — полное разведение (Full release control · 30 12 07 00)",
    nameEn: "EPB Full release control (Pad replacement)",
    descriptionRu:
      "Полностью разводит электроприводы стояночного тормоза EPB (30 12 07 00 -> 30 12 01) для безопасного вдавливания поршней и замены задних тормозных колодок.",
    preconditionsRu: "Автомобиль надёжно зафиксирован противооткатными упорами, селектор в P, зажигание ВКЛ, двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_EPB,
  },
  {
    id: "epb_tension_sensor_zero_reset",
    fid: 68308,
    packageId: "brakes_chassis",
    kind: "calibration",
    txCanId: "610",
    rxCanId: "611",
    sessionHex: "1092",
    startRequest: "3101",
    nameRu: "Калибровка нуля датчика усилия электроручника EPB (Tension sensor 0-point reset · 31 01)",
    nameEn: "EPB Tension sensor 0 point reset",
    descriptionRu:
      "Калибрует нулевую точку тензодатчика усилия затяжки электроручника EPB (31 01) после завершения замены задних тормозных колодок.",
    preconditionsRu: "Зажигание ВКЛ (ON), стояночный тормоз полностью отпущен, автомобиль на ровной поверхности.",
    supportedSkeys: SKEYS_EPB,
  },
  {
    id: "awc_reset_coupling_and_sas",
    fid: 50108,
    packageId: "brakes_chassis",
    kind: "reset",
    txCanId: "7B6",
    rxCanId: "7B7",
    sessionHex: "1092",
    startRequest: "3170",
    verifyReadRequest: "2116",
    nameRu: "Сброс коррекции датчика руля в блоке полного привода AWC/4WD (SAS adjusted value reset · 31 70)",
    nameEn: "AWC SAS adjusted value reset",
    descriptionRu:
      "Сбрасывает накопленную поправку нулевого положения руля в блоке управления полным приводом AWC (31 70, проверка по 21 16). Выполняется после регулировки сход-развала и калибровки SAS.",
    preconditionsRu: "Зажигание ВКЛ (ON), руль прямо, автомобиль неподвижен.",
    supportedSkeys: SKEYS_AWC,
  },

  // ============================================================================
  // ПАКЕТ 4: Комбинация приборов METER (6A0 -> 514) и ETACS (620 -> 504)
  // ============================================================================
  {
    id: "meter_service_reminder_reset",
    fid: 7408,
    packageId: "meter_body",
    kind: "reset",
    txCanId: "6A0",
    rxCanId: "514",
    sessionHex: "1092",
    startRequest: "3106",
    verifyReadRequest: "21BC",
    nameRu: "Сброс сервисного интервала ТО на приборной панели (Service Reminder Reset · 31 06)",
    nameEn: "Service reminder reset",
    descriptionRu:
      "Сбрасывает напоминание о периодическом техническом обслуживании («Service Required») в комбинации приборов (31 06) и перечитывает остаток пробега и месяцев до следующего ТО (21 BC).",
    preconditionsRu: "Зажигание ВКЛ (ON), автомобиль неподвижен.",
    supportedSkeys: SKEYS_METER_6A0,
  },
  {
    id: "meter_pointer_self_test",
    fid: 50208,
    packageId: "meter_body",
    kind: "actuator",
    txCanId: "6A0",
    rxCanId: "514",
    sessionHex: "1092",
    startRequest: "3101",
    stopRequest: "3201",
    holdMs: 3500,
    nameRu: "Тест стрелок спидометра, тахометра и указателя топлива (Pointer AUTO Test · 31 01)",
    nameEn: "Meter Pointer (AUTO) Test",
    descriptionRu:
      "Запускает автоматический прогон всех стрелочных указателей комбинации приборов по контрольным точкам шкалы (31 01 -> 32 01) для проверки шаговых приводов стрелок.",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН, автомобиль неподвижен.",
    supportedSkeys: SKEYS_METER_6A0,
  },
  {
    id: "etacs_height_sensor_learning",
    fid: 50708,
    packageId: "meter_body",
    kind: "calibration",
    txCanId: "620",
    rxCanId: "504",
    sessionHex: "1092",
    startRequest: "3141",
    pollRequest: "3341",
    nameRu: "Калибровка начального положения датчика высоты кузова / автокорректора фар (HS Learning · 31 41)",
    nameEn: "HS initial position Learning",
    descriptionRu:
      "Запоминает текущее положение датчиков высоты подвески в ETACS как базовую нулевую точку автокорректора фар (31 41 -> 33 41). Выполняется после замены датчиков высоты, пружин/амортизаторов или регулировки света фар.",
    preconditionsRu: "Автомобиль без груза на ровной горизонтальной площадке, зажигание ВКЛ (ON).",
    supportedSkeys: SKEYS_ETACS_HS,
  },
  {
    id: "etacs_customization_factory_reset",
    fid: 63708,
    packageId: "meter_body",
    kind: "reset",
    txCanId: "620",
    rxCanId: "504",
    sessionHex: "1092",
    startRequest: "31B4",
    nameRu: "Сброс пользовательской кастомизации ETACS к заводским настройкам (Customization Reset · 31 B4)",
    nameEn: "ETACS Customization Reset",
    descriptionRu:
      "Возвращает все пользовательские настройки комфорта (кастомизацию ETACS) к заводским значениям по умолчанию (31 B4), не затрагивая вариантное кодирование комплектации (.kon).",
    preconditionsRu: "Зажигание ВКЛ (ON), двигатель ЗАГЛУШЕН.",
    supportedSkeys: SKEYS_ETACS_CUSTOM_RESET,
  },
];

function normalizeSkey(skey: string | null | undefined): string {
  return (skey ?? "").trim();
}

function normalizeHexId(id: string | null | undefined): string {
  return (id ?? "").trim().replace(/^0x/i, "").toUpperCase();
}

/**
 * Returns ONLY the service procedures that are supported by the diagnosed vehicle's specific ECU SKEY
 * and CAN address (`txCanId`). Prevents any accidental execution of foreign commands on an incompatible vehicle/ECU.
 */
export function getMitsubishiProceduresForEcu(options: {
  skey: string | null | undefined;
  txCanId: string | null | undefined;
  rxCanId?: string | null | undefined;
}): MitsubishiServiceProcedure[] {
  const skey = normalizeSkey(options.skey);
  const tx = normalizeHexId(options.txCanId);
  if (!skey || !tx) return [];
  const rx = options.rxCanId ? normalizeHexId(options.rxCanId) : null;
  return MITSUBISHI_SERVICE_PROCEDURES.filter((proc) => {
    if (proc.txCanId !== tx) return false;
    if (rx && proc.rxCanId !== rx) return false;
    return proc.supportedSkeys.includes(skey);
  });
}

/**
 * Strictly validates that a procedure ID is registered for the given ECU SKEY and CAN address before sending any frame.
 */
export function assertMitsubishiProcedureForEcu(options: {
  procedureId: string;
  skey: string | null | undefined;
  txCanId: string | null | undefined;
  rxCanId: string | null | undefined;
}): MitsubishiServiceProcedure {
  const skey = normalizeSkey(options.skey);
  const tx = normalizeHexId(options.txCanId);
  const rx = normalizeHexId(options.rxCanId);
  if (!skey) {
    throw new Error("Не определён профиль SKEY диагностируемого блока. Сначала выберите автомобиль и откройте блок.");
  }
  const proc = MITSUBISHI_SERVICE_PROCEDURES.find((item) => item.id === options.procedureId);
  if (!proc) {
    throw new Error(`Сервисная функция «${options.procedureId}» не существует в справочнике MUT-III SE.`);
  }
  if (proc.txCanId !== tx || proc.rxCanId !== rx) {
    throw new Error(
      `Функция «${proc.nameRu}» предназначена для блока ${proc.txCanId}→${proc.rxCanId}, а не для ${tx}→${rx}. Выполнение заблокировано.`,
    );
  }
  if (!proc.supportedSkeys.includes(skey)) {
    throw new Error(
      `Функция «${proc.nameRu}» (fid=${proc.fid}) не поддерживается профилем SKEY ${skey} выбранного автомобиля. Выполнение заблокировано для защиты ЭБУ.`,
    );
  }
  return proc;
}

/**
 * Decodes 60-byte response of `21 BF` (`61 BF <60 bytes>`) into 4 × 15-character ASCII Injector IDs
 * per `DIESEL4N1_06040200.exdf` (`qid=349..352`: bytePos 2, 17, 32, 47, length 15 each).
 */
export function decodeMitsubishiDieselInjectorIds21BF(dataAfterLid: number[]): string[] {
  const codes: string[] = [];
  for (let cyl = 0; cyl < 4; cyl++) {
    const start = cyl * 15;
    if (start + 15 > dataAfterLid.length) break;
    const slice = dataAfterLid.slice(start, start + 15);
    const ascii = slice
      .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ""))
      .join("")
      .trim();
    codes.push(ascii || slice.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(""));
  }
  return codes;
}

/**
 * Decodes `21 BC` Service Reminder payload from `METER_84088001.exdf` (`bytePos 2..3` Little-Endian km/miles, `bytePos 4` months).
 */
export function decodeMitsubishiServiceReminder21BC(dataAfterLid: number[]): {
  distanceRemaining: number;
  monthsRemaining: number;
} | null {
  if (dataAfterLid.length < 3) return null;
  const rawDist = dataAfterLid[0]! + (dataAfterLid[1]! << 8);
  const months = dataAfterLid[2]!;
  return {
    distanceRemaining: rawDist === 0xffff ? 0 : rawDist * 100,
    monthsRemaining: months === 0xff ? 0 : months,
  };
}
