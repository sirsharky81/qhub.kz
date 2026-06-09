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
