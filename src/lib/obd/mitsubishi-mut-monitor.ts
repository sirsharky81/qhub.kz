import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";

export type MitsubishiGearboxKind = "8AT" | "5AT" | "CVT";

export interface MitsubishiFluidBand {
  id: "cold" | "level" | "warm" | "work" | "hot";
  labelRu: string;
}

/**
 * Level-check windows from the Mitsubishi service procedure, not the sensor offset.
 * AT8 V8AWG/R8AWG (Pajero Sport III, 2018 23A): oil-pan temperature,
 * 40–43 °C on 6B31 and 43–46 °C on 4N15. At 47 °C the warning mark blinks and the check is not done.
 * CVT (Outlander III): 70–80 °C, selector P, idle.
 */
export function mitsubishiFluidBand(
  tempC: number,
  kind: MitsubishiGearboxKind,
): MitsubishiFluidBand {
  if (kind === "CVT") {
    if (tempC < 50) return { id: "cold", labelRu: "Холодная — уровень CVT ещё рано проверять" };
    if (tempC <= 69) return { id: "warm", labelRu: "Прогрев — до окна уровня CVT 70–80 °C ещё рано" };
    if (tempC <= 80) {
      return { id: "level", labelRu: "Окно уровня CVT (70–80 °C, селектор P, холостой ход)" };
    }
    if (tempC <= 110) return { id: "work", labelRu: "Рабочая температура CVT (после поездки)" };
    return { id: "hot", labelRu: "Перегрев масла коробки (> 110 °C)" };
  }

  if (kind === "5AT") {
    if (tempC < 39) return { id: "cold", labelRu: "Рано: уровень 5AT смотрят при 39–46 °C" };
    if (tempC <= 46) return { id: "level", labelRu: "Окно уровня 5AT (39–46 °C)" };
    if (tempC <= 110) return { id: "work", labelRu: "Выше окна уровня 5AT (с 47 °C проверку не делают)" };
    return { id: "hot", labelRu: "Перегрев масла коробки (> 110 °C)" };
  }

  if (tempC < 40) {
    return { id: "cold", labelRu: "Рано: уровень AT8 смотрят по картеру, 40–43 °C на 6B31 или 43–46 °C на 4N15" };
  }
  if (tempC <= 42) {
    return { id: "level", labelRu: "Окно уровня AT8 для 6B31 (40–43 °C, картер). Для 4N15 ещё рано" };
  }
  if (tempC === 43) {
    return { id: "level", labelRu: "Окно уровня AT8: 43 °C подходит и 6B31, и 4N15" };
  }
  if (tempC <= 46) {
    return { id: "level", labelRu: "Окно уровня AT8 для 4N15 (43–46 °C, картер). Для 6B31 уже поздно" };
  }
  if (tempC <= 110) {
    return { id: "work", labelRu: "47 °C и выше — окно уровня AT8 закрыто, индикатор мигает" };
  }
  return { id: "hot", labelRu: "Перегрев масла коробки (> 110 °C)" };
}

const MONITOR_NAME =
  /ATF|A\/T fluid|CVT oil temp|темп\.?\s*масла CVT|темп\.?\s*жидк\.?\s*АКП|oil pan|oil TEMP|coolant|ОЖ|темп.*двиг|Engine speed|обороты|Vehicle speed|скор\.?\s*авт|Input shaft|Output shaft|Primary speed|педал|throttle|дроссел|нагруз|load|MAP|MAF|STFT|LTFT|Fuel trim|коррекц|Battery|напряж|voltage|пит\.|давлени|pressure|TPMS|шин|Fuel level|топлив|одометр|Odometer|Gear|передач|селектор|Shift position|Lock.?up|муфт|4WD|G[- ]?sensor|steer|рул|тормоз|Brake/i;

export function isPreferredMonitorSignal(signal: CatalogSignal): boolean {
  return MONITOR_NAME.test(`${signal.nameEn} ${signal.nameRu} ${signal.unit}`);
}

/** MUT-III Data List items to pin first when a module is opened. */
export function pickPreferredMonitorSignals(signals: CatalogSignal[], limit = 16): string[] {
  const ranked = [...signals].sort((left, right) => {
    const leftHit = isPreferredMonitorSignal(left) ? 0 : 1;
    const rightHit = isPreferredMonitorSignal(right) ? 0 : 1;
    if (leftHit !== rightHit) return leftHit - rightHit;
    const leftTemp = /temp|темп|ATF|CVT oil/i.test(`${left.nameEn} ${left.nameRu}`) ? 0 : 1;
    const rightTemp = /temp|темп|ATF|CVT oil/i.test(`${right.nameEn} ${right.nameRu}`) ? 0 : 1;
    return leftTemp - rightTemp;
  });
  return ranked.slice(0, limit).map((signal) => signal.id);
}

export function isTransmissionEcu(nameEn: string, nameRu: string): boolean {
  return /AT\/CVT|A-MT|TC-SST|АКП|вариатор|TCM/i.test(`${nameEn} ${nameRu}`);
}

const PART_NUMBER = /[0-9]{4}[A-Z][0-9]{3}/;

/** Part number from `1A 87` / `21 87`, diagnostic version from the first two `1A 9C` data bytes. */
export function parseMitsubishiModuleIdentity(
  request: string,
  payload: number[],
): { partNumber: string | null; diagVersion: string | null } {
  const compact = request.replace(/\s+/g, "").toUpperCase();
  const lid = payload[0] ?? -1;
  const data = payload.slice(1);
  const isVersion = compact.endsWith("9C") || lid === 0x9c;
  const isPart = compact.endsWith("87") || lid === 0x87;
  let diagVersion: string | null = null;
  if (isVersion && data.length >= 2 && data[0]! <= 0x0f) {
    diagVersion = `${data[0]!.toString(16).padStart(2, "0")}${data[1]!.toString(16).padStart(2, "0")}`.toUpperCase();
  }
  if (!isPart) return { partNumber: null, diagVersion };
  const ascii = data
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " "))
    .join("");
  return { partNumber: ascii.match(PART_NUMBER)?.[0] ?? null, diagVersion };
}

export type MitsubishiServiceSet = "engine" | "gearbox" | "4wd" | "body";

const SERVICE_RANK: Record<MitsubishiServiceSet, RegExp[]> = {
  engine: [
    /engine speed|обороты/i,
    /calculated load|engine load|\bload\b|нагруз/i,
    /manifold|\bMAP\b|intake manifold/i,
    /\bMAF\b|mass air|расход воздух/i,
    /short.?term|\bSTFT\b|кратковремен/i,
    /long.?term|\bLTFT\b|долговремен/i,
    /coolant|охлаждающ|\bОЖ\b/i,
    /battery|control voltage|напряж|voltage|пит/i,
    /rail|рамп|fuel pressure|давлен.*топлив/i,
  ],
  gearbox: [
    /ATF|A\/T fluid|CVT oil|темп\.?\s*масла|темп\.?\s*жидк|oil pan|oil TEMP/i,
    /selector|shift position|селектор|gear position|передач/i,
    /input shaft|primary speed|входн/i,
    /output shaft|secondary speed|выходн/i,
    /pressure|давлени/i,
    /degrad|старен|oil deterioration/i,
  ],
  "4wd": [/current|ток|ампер/i, /pressure|давлени/i, /clutch|муфт|4WD|AWC|SS4/i],
  body: [/door|двер|концевик|hood|капот|tailgate|багаж/i, /battery|voltage|напряж|пит/i],
};

export function ecuMatchesServiceSet(nameEn: string, nameRu: string, set: MitsubishiServiceSet): boolean {
  const text = `${nameEn} ${nameRu}`;
  if (set === "engine") return /MPI\/GDI|DIESEL|ДВС|двигат/i.test(text);
  if (set === "gearbox") return isTransmissionEcu(nameEn, nameRu);
  if (set === "4wd") return /4WD|AWC|SS4|полный привод/i.test(text);
  return /ETACS/i.test(text);
}

export function pickServiceSetSignals(signals: CatalogSignal[], set: MitsubishiServiceSet, limit = 16): string[] {
  const ranks = SERVICE_RANK[set];
  const ranked = signals
    .map((signal) => {
      const text = `${signal.nameEn} ${signal.nameRu} ${signal.unit}`;
      const rank = ranks.findIndex((pattern) => pattern.test(text));
      return { signal, rank };
    })
    .filter((item) => item.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.signal.id.localeCompare(right.signal.id));
  return ranked.slice(0, limit).map((item) => item.signal.id);
}

export interface MitsubishiVisitModule {
  nameRu: string;
  address: string;
  responded: boolean | null;
  partNumber?: string | null;
  dtcs: Array<{ code: string; textRu: string; remedy?: string | null; active?: boolean }>;
}

export interface MitsubishiVisitReportInput {
  vin: string | null;
  vehicleName: string | null;
  modules: MitsubishiVisitModule[];
  transmission: {
    kind: string;
    tempC: number | null;
    pipeC: number | null;
    panC: number | null;
    formula: string | null;
    bandRu: string | null;
    selector: string | null;
    gear: string | null;
    inputRpm: number | null;
    outputRpm: number | null;
    degradation: number | null;
  } | null;
  pressures: Array<{ label: string; value: string }>;
  tpms: Array<{ label: string; bar: number | null; tempC: number | null }>;
  meter: { fuelLiters: number | null; odometerKm: number | null } | null;
  live: Array<{ name: string; value: string; unit: string }>;
}

function visitCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Workshop visit sheet: VIN, modules, DTC text, temperatures and pressures. Text rows in CSV, no PDF. */
export function buildMitsubishiVisitReport(input: MitsubishiVisitReportInput): string {
  const rows: string[][] = [["section", "name", "value", "note"]];
  const add = (section: string, name: string, value: string, note = "") => {
    rows.push([section, name, value, note]);
  };
  add("visit", "VIN", input.vin ?? "");
  add("visit", "vehicle", input.vehicleName ?? "");
  if (input.transmission) {
    const box = input.transmission;
    add("transmission", "kind", box.kind);
    add("transmission", "fluid_c", box.tempC == null ? "" : String(box.tempC), box.bandRu ?? "");
    add("transmission", "pipe_c", box.pipeC == null ? "" : String(box.pipeC), box.formula ?? "");
    add("transmission", "pan_c", box.panC == null ? "" : String(box.panC));
    add("transmission", "selector", box.selector ?? "");
    add("transmission", "gear", box.gear ?? "");
    add("transmission", "input_rpm", box.inputRpm == null ? "" : String(box.inputRpm));
    add("transmission", "output_rpm", box.outputRpm == null ? "" : String(box.outputRpm));
    add("transmission", "cvt_degradation", box.degradation == null ? "" : String(box.degradation));
  }
  for (const item of input.pressures) add("pressure", item.label, item.value);
  for (const wheel of input.tpms) {
    add(
      "tpms",
      wheel.label,
      wheel.bar == null ? "" : String(wheel.bar),
      wheel.tempC == null ? "" : `${wheel.tempC} C`,
    );
  }
  if (input.meter) {
    add("meter", "fuel_l", input.meter.fuelLiters == null ? "" : String(input.meter.fuelLiters));
    add("meter", "odometer_km", input.meter.odometerKm == null ? "" : String(input.meter.odometerKm));
  }
  for (const module of input.modules) {
    const state = module.responded == null ? "not_scanned" : module.responded ? "ok" : "no_reply";
    add("module", module.nameRu, state, `${module.address}${module.partNumber ? ` ${module.partNumber}` : ""}`);
    for (const dtc of module.dtcs) {
      add("dtc", dtc.code, dtc.textRu, `${module.nameRu}${dtc.active === false ? " memory" : ""}${dtc.remedy ? ` | ${dtc.remedy}` : ""}`);
    }
  }
  for (const item of input.live) add("live", item.name, item.value, item.unit);
  return rows.map((row) => row.map(visitCell).join(",")).join("\n");
}
