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

  hasPrompt(): boolean {
    return />\s*$/.test(this.text);
  }
}

export function decodeDataView(view: DataView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return new TextDecoder().decode(bytes);
}
