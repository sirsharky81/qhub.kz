import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";

export type MitsubishiGearboxKind = "8AT / 5AT" | "CVT";

export interface MitsubishiFluidBand {
  id: "cold" | "level" | "warm" | "work" | "hot";
  labelRu: string;
}

/**
 * MUT-III SE Data List windows used in the workshop for ATF / CVT fluid level.
 * 8AT V8AWG (Pajero Sport III, AT8_12882300): pan/pipe sensors, A − 50.
 * CVT F1CJC/W1CJA (Outlander III, CVT_14080300): 21 03 oil temperature, A − 55.
 */
export function mitsubishiFluidBand(
  tempC: number,
  kind: MitsubishiGearboxKind,
): MitsubishiFluidBand {
  if (tempC < 50) {
    return { id: "cold", labelRu: "Холодная — уровень масла ещё рано проверять" };
  }
  if (tempC <= 69) {
    return { id: "warm", labelRu: "Прогрев — до окна уровня 70–80 °C ещё рано" };
  }
  if (tempC <= 80) {
    return {
      id: "level",
      labelRu:
        kind === "CVT"
          ? "Окно уровня CVT (70–80 °C, селектор P, холостой ход)"
          : "Окно уровня ATF (70–80 °C, селектор P, холостой ход)",
    };
  }
  if (tempC <= 110) {
    return { id: "work", labelRu: "Рабочая температура (после поездки)" };
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
