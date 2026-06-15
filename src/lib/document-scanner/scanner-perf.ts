const ENABLED =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "development";

export function perfMark(label: string): void {
  if (ENABLED && typeof performance !== "undefined") {
    performance.mark(`scanner:${label}`);
  }
}

export function perfMeasure(label: string, startLabel: string): void {
  if (!ENABLED || typeof performance === "undefined") return;
  try {
    performance.measure(`scanner:${label}`, `scanner:${startLabel}`);
    const entries = performance.getEntriesByName(`scanner:${label}`);
    const last = entries[entries.length - 1];
    if (last) {
      console.debug(`[document-scanner] ${label}: ${last.duration.toFixed(1)}ms`);
    }
  } catch {
    /* ignore missing marks */
  }
}

export async function perfAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = `scanner:${label}:start`;
  perfMark(start);
  try {
    return await fn();
  } finally {
    perfMeasure(label, start);
  }
}
