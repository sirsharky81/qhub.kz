"use client";

import { useCallback, useState } from "react";
import {
  sanitizeTimeInput,
  sanitizeSecondsInput,
  parseBoundedSeconds,
  snapToStep,
} from "@/lib/music-editor/format";

interface TimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlurExtra?: () => void;
}

export function TimeField({
  value,
  onChange,
  onCommit,
  className,
  placeholder = "00:00.0",
  onFocus,
  onBlurExtra,
}: TimeFieldProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(sanitizeTimeInput(e.target.value))}
      onFocus={(e) => {
        onFocus?.();
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        onCommit();
        onBlurExtra?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}

interface SecondsFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  onBeginGesture?: () => void;
  onEndGesture?: () => void;
}

function formatSecondsDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function SecondsField({
  value,
  onChange,
  min = 0,
  max = 30,
  step = 0.5,
  className,
  onBeginGesture,
  onEndGesture,
}: SecondsFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = useCallback(() => {
    const raw = draft !== null ? draft : formatSecondsDisplay(value);
    let parsed = parseBoundedSeconds(raw, min, max, value);
    parsed = snapToStep(parsed, step);
    onChange(parsed);
    setDraft(null);
    onEndGesture?.();
  }, [draft, value, min, max, step, onChange, onEndGesture]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={draft !== null ? draft : formatSecondsDisplay(value)}
      onChange={(e) => setDraft(sanitizeSecondsInput(e.target.value))}
      onFocus={(e) => {
        onBeginGesture?.();
        setDraft(value === 0 ? "" : formatSecondsDisplay(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
    />
  );
}
