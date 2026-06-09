export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Precise time format: MM:SS.s (e.g. 01:23.4) */
export function formatTimePrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const tenths = Math.floor((secs - whole) * 10);
  return `${mins.toString().padStart(2, "0")}:${whole.toString().padStart(2, "0")}.${tenths}`;
}

/** Parse MM:SS.s or M:SS or SS.s */
export function parseTimePrecise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d))?$/);
  if (match) {
    const mins = Number(match[1]);
    const secs = Number(match[2]);
    const tenths = match[3] ? Number(match[3]) : 0;
    if (secs >= 60) return null;
    return mins * 60 + secs + tenths / 10;
  }

  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function parseDurationInput(value: string): number | null {
  return parseTimePrecise(value) ?? parseDurationInputLegacy(value);
}

function parseDurationInputLegacy(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function durationToInput(seconds: number): string {
  return formatTimePrecise(seconds);
}

export function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(time, duration));
}

/** Allow only MM:SS.s characters while typing; block invalid second values. */
export function sanitizeTimeInput(raw: string): string {
  const filtered = raw.replace(/[^\d:.]/g, "");
  let result = "";
  let hasColon = false;
  let hasDot = false;

  for (const ch of filtered) {
    if (ch >= "0" && ch <= "9") {
      if (!hasColon) {
        result += ch;
        continue;
      }

      const colonPos = result.indexOf(":");
      const dotPos = result.indexOf(".");

      if (dotPos < 0) {
        const secPart = result.slice(colonPos + 1);
        if (secPart.length >= 2) continue;
        const next = secPart + ch;
        if (next.length === 2 && Number(next) > 59) continue;
        result += ch;
      } else if (result.length - dotPos <= 1) {
        result += ch;
      }
    } else if (ch === ":" && !hasColon && result.length > 0) {
      hasColon = true;
      result += ch;
    } else if (ch === "." && hasColon && !hasDot) {
      hasDot = true;
      result += ch;
    }
  }

  return result;
}

/** Decimal seconds field — digits and one dot only. */
export function sanitizeSecondsInput(raw: string, maxDecimals = 1): string {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
  }
  return s;
}

export function parseBoundedSeconds(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function snapToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}
