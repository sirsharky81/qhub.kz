"use client";

import { useCallback, useMemo, useState } from "react";
import { getDisplayTier, passesStabilityGate } from "../pitch/confidence";
import type { PitchReading, PitchResult, TunerDisplayState } from "../types";

const HISTORY_MAX = 8;

export interface UseTunerStateResult {
  display: PitchResult | null;
  displayState: TunerDisplayState;
  rawReading: PitchReading | null;
  pushReading: (reading: PitchReading | null) => void;
  reset: () => void;
}

export function useTunerState(isReconfiguring: boolean): UseTunerStateResult {
  const [rawReading, setRawReading] = useState<PitchReading | null>(null);
  const [history, setHistory] = useState<PitchReading[]>([]);

  const pushReading = useCallback((reading: PitchReading | null) => {
    if (!reading) return;
    setRawReading(reading);
    setHistory((prev) => {
      const next = [...prev, reading];
      return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
    });
  }, []);

  const reset = useCallback(() => {
    setHistory([]);
    setRawReading(null);
  }, []);

  const displayState: TunerDisplayState = useMemo(() => {
    if (isReconfiguring) return "listening";
    if (!rawReading) return "listening";
    const tier = getDisplayTier(rawReading.confidence);
    if (tier === "hidden") return "listening";
    if (tier === "uncertain") return "uncertain";
    if (passesStabilityGate(history)) return "stable";
    return "listening";
  }, [rawReading, isReconfiguring, history]);

  const display: PitchResult | null = useMemo(() => {
    if (!rawReading || displayState === "listening") return null;
    return {
      frequency: rawReading.frequency,
      clarity: rawReading.clarity,
      note: rawReading.note,
      cents: rawReading.cents,
      confidence: rawReading.confidence,
      rms: rawReading.rms,
      snr: rawReading.snr,
      stable: displayState === "stable",
    };
  }, [rawReading, displayState]);

  return { display, displayState, rawReading, pushReading, reset };
}
