import { AssistPeer } from "./peer";
import { parseAssistFrame, type AssistElmResponse } from "./protocol";
import type { AssistStatusCode } from "./status";

interface Pending {
  resolve: (raw: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Master side of the ELM relay. Hex stays on this channel and is not shown to the client. */
export class AssistElmChannel {
  private pending = new Map<string, Pending>();
  private seq = 0;

  constructor(
    private peer: AssistPeer,
    private onStatus: (code: string) => void,
  ) {
    peer.onMessage((raw) => this.onFrame(raw));
  }

  private onFrame(raw: string): void {
    const frame = parseAssistFrame(raw);
    if (!frame) return;
    if (frame.t === "status") {
      this.onStatus(frame.code);
      return;
    }
    if (frame.t !== "elm-res") return;
    const job = this.pending.get(frame.id);
    if (!job) return;
    clearTimeout(job.timer);
    this.pending.delete(frame.id);
    if (frame.ok && typeof frame.raw === "string") job.resolve(frame.raw);
    else job.reject(new Error(frame.error || "Адаптер не ответил"));
  }

  request(command: string, timeoutMs = 10_000): Promise<string> {
    if (!this.peer.isOpen()) return Promise.reject(new Error("vLinker клиента ещё не на связи"));
    const id = `${Date.now().toString(36)}-${this.seq++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Таймаут ELM"));
      }, timeoutMs + 2_500);
      this.pending.set(id, { resolve, reject, timer });
      this.peer.send(JSON.stringify({ t: "elm", id, command, timeoutMs }));
    });
  }

  publishStatus(code: AssistStatusCode): void {
    this.peer.send(JSON.stringify({ t: "status", code }));
  }

  failAll(message: string): void {
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    this.pending.clear();
  }
}

export function assistElmResponse(id: string, ok: boolean, raw?: string, error?: string): string {
  const frame: AssistElmResponse = {
    t: "elm-res",
    id,
    ok,
    raw: raw?.slice(0, 80_000),
    error: error?.slice(0, 300),
  };
  return JSON.stringify(frame);
}
