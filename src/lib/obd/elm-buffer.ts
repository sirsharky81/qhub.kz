/** Accumulates notify chunks into ELM327 text responses. */
export class ElmRxBuffer {
  private text = "";

  appendChunk(chunk: string): void {
    this.text += chunk;
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
 * arrives in the next packet is included. A lone `>` right after the write is
 * ignored briefly — vLinker often prints it before the real line.
 */
export async function readElmUntilQuietPrompt(buffer: ElmRxBuffer, timeoutMs: number): Promise<string> {
  const started = Date.now();
  const quietMs = 70;
  while (Date.now() - started < timeoutMs) {
    if (!buffer.hasPrompt()) {
      await delay(40);
      continue;
    }
    const before = buffer.snapshot().length;
    await delay(quietMs);
    if (buffer.snapshot().length !== before) continue;
    const snap = buffer.snapshot();
    const body = snap.replace(/>/g, "").trim();
    if (!body && Date.now() - started < Math.min(700, timeoutMs)) {
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
