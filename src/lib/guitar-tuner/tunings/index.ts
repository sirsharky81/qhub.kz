import { BASS_TUNINGS } from "./bass";
import { CHROMATIC_TUNINGS } from "./chromatic";
import { GUITAR_TUNINGS } from "./guitar";
import type { InstrumentDefinition, TuningPreset } from "./types";
import { UKULELE_TUNINGS } from "./ukulele";

export const INSTRUMENTS: InstrumentDefinition[] = [
  { id: "guitar", name: "Гитара", tunings: GUITAR_TUNINGS },
  { id: "bass", name: "Бас", tunings: BASS_TUNINGS },
  { id: "ukulele", name: "Укулеле", tunings: UKULELE_TUNINGS },
  { id: "chromatic", name: "Хроматик", tunings: CHROMATIC_TUNINGS },
];

export function getInstrument(id: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

export function getTuning(instrumentId: string, tuningId: string): TuningPreset | undefined {
  const instrument = getInstrument(instrumentId);
  return instrument?.tunings.find((t) => t.id === tuningId);
}

export function getDefaultTuning(instrumentId: string): TuningPreset {
  const instrument = getInstrument(instrumentId);
  return instrument?.tunings[0] ?? CHROMATIC_TUNINGS[0];
}
