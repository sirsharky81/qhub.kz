"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { PIN_LENGTH } from "@/lib/messenger/constants";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PinInput({ value, onChange, disabled, autoFocus }: Props) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(PIN_LENGTH, " ").slice(0, PIN_LENGTH).split("");

  function updateAt(index: number, char: string) {
    const next = digits.map((d, i) => (i === index ? char : d === " " ? "" : d)).join("");
    onChange(next.replace(/\s/g, "").slice(0, PIN_LENGTH));
    if (char && index < PIN_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={digits[i]?.trim() ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            updateAt(i, v);
          }}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-14 h-16 text-center text-2xl font-semibold rounded-2xl border border-gray-200 bg-white focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 outline-none"
          aria-label={`Цифра PIN ${i + 1}`}
        />
      ))}
    </div>
  );
}
