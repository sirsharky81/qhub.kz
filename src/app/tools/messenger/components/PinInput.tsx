"use client";

import { useId, useRef } from "react";
import { PIN_LENGTH } from "@/lib/messenger/constants";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PinInput({ value, onChange, disabled, autoFocus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        id={labelId}
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={PIN_LENGTH}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
        className="sr-only"
        aria-label="PIN"
      />
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex gap-3 justify-center touch-manipulation"
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < value.length;
          const active = i === value.length;
          return (
            <div
              key={i}
              aria-hidden
              className={`w-14 h-16 flex items-center justify-center text-2xl font-semibold rounded-2xl border bg-white transition-colors ${
                active
                  ? "border-gray-900 ring-2 ring-gray-900/10"
                  : filled
                    ? "border-gray-300"
                    : "border-gray-200"
              } ${disabled ? "opacity-50" : ""}`}
            >
              {filled ? "•" : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
