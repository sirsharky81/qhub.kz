export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256HexIncremental(chunks: AsyncIterable<ArrayBuffer>): Promise<string> {
  // Web Crypto doesn't support incremental SHA-256 in all browsers for streaming;
  // concatenate in memory for chunks we control (max 1GB session).
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    const view = new Uint8Array(chunk);
    parts.push(view);
    total += view.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  const hash = await crypto.subtle.digest("SHA-256", merged);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
