/** Accumulates notify chunks into ELM327 text responses. */
export class ElmRxBuffer {
  private text = "";
  private listeners = new Set<() => void>();

  appendChunk(chunk: string): void {
    this.text += chunk;
    if (this.listeners.size > 0) {
      for (const listener of [...this.listeners]) {
        listener();
      }
    }
  }

  clear(): void {
    this.text = "";
  }

  snapshot(): string {
    return this.text;
  }

  /** Take everything received so far. Used while ATMA streams frames without `>`. */
  takePending(): string {
    const snap = this.text;
    this.text = "";
    return snap;
  }

  hasPrompt(): boolean {
    return />\s*$/.test(this.text);
  }

  waitForChunkOrTimeout(ms: number): Promise<void> {
    if (this.hasPrompt()) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.listeners.delete(onChunk);
        resolve();
      };
      const onChunk = () => {
        if (this.hasPrompt()) done();
      };
      const timer = setTimeout(done, ms);
      this.listeners.add(onChunk);
    });
  }
}

export function decodeDataView(view: DataView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return new TextDecoder().decode(bytes);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until ELM prints `>`, then a short quiet period so a BLE notify that
 * arrives in the next packet is included.
 * When `allowBarePrompt` is true (e.g. ISO-TP Consecutive Frame sent with ` 0` where ELM
 * prints only `>` with no body), returns immediately as soon as `>` arrives!
 */
export async function readElmUntilQuietPrompt(
  buffer: ElmRxBuffer,
  timeoutMs: number,
  options?: { quietMs?: number; allowBarePrompt?: boolean },
): Promise<string> {
  const started = Date.now();
  const quietMs = options?.quietMs ?? 25;
  const allowBarePrompt = options?.allowBarePrompt ?? false;

  while (Date.now() - started < timeoutMs) {
    if (!buffer.hasPrompt()) {
      const remaining = Math.max(5, Math.min(25, timeoutMs - (Date.now() - started)));
      await buffer.waitForChunkOrTimeout(remaining);
      if (!buffer.hasPrompt()) continue;
    }

    if (quietMs > 0) {
      const before = buffer.snapshot().length;
      await delay(quietMs);
      if (buffer.snapshot().length !== before) continue;
    }

    const snap = buffer.snapshot();
    const body = snap.replace(/>/g, "").trim();
    if (!allowBarePrompt && !body && Date.now() - started < Math.min(400, timeoutMs)) {
      buffer.clear();
      continue;
    }
    buffer.clear();
    return snap;
  }
  const partial = buffer.snapshot();
  buffer.clear();
  throw new Error(
    partial.trim()
      ? `Таймаут ELM (частичный ответ): ${partial.slice(-120)}`
      : "Таймаут ELM — нет ответа от адаптера",
  );
}
