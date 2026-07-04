export type CallJournalEventType =
  | "INITIATE"
  | "CREATE_PC"
  | "OFFER_SENT"
  | "ANSWER_RECEIVED"
  | "ICE_CONNECTING"
  | "ICE_CONNECTED"
  | "ICE_DISCONNECTED"
  | "ICE_FAILED"
  | "TRACK_REMOTE"
  | "VIDEO_RECOVER"
  | "CALL_STATE"
  | "IGNORED_EVENT"
  | "SIGNAL_RECEIVED"
  | "HANGUP"
  | "DECLINE"
  | "CLEANUP_START"
  | "CLEANUP_COMPLETE"
  | "INVARIANT_VIOLATION";

export interface CallJournalEntry {
  seq: number;
  elapsedMs: number;
  callId: string | null;
  sessionId: string;
  peer: string | null;
  type: CallJournalEventType;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface CallJournalContext {
  elapsedMs: number;
  callId: string | null;
  sessionId: string;
  peer: string | null;
}

export class CallJournal {
  private seq = 0;
  private entries: CallJournalEntry[] = [];

  constructor(
    private readonly getContext: () => CallJournalContext,
    private readonly maxEntries = 500,
  ) {}

  clear(): void {
    this.seq = 0;
    this.entries = [];
  }

  getEntries(): readonly CallJournalEntry[] {
    return this.entries;
  }

  record(
    type: CallJournalEventType,
    detail?: string,
    meta?: Record<string, string | number | boolean | null>,
  ): void {
    const context = this.getContext();
    const next: CallJournalEntry = {
      seq: ++this.seq,
      elapsedMs: Math.max(0, context.elapsedMs),
      callId: context.callId,
      sessionId: context.sessionId,
      peer: context.peer,
      type,
      detail,
      meta,
    };
    this.entries.push(next);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  exportText(): string {
    return this.entries
      .map((e) => {
        const sec = Math.floor(e.elapsedMs / 1000);
        const tenth = Math.floor((e.elapsedMs % 1000) / 100);
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        const base =
          `#${String(e.seq).padStart(3, "0")}  ${mm}:${ss}.${tenth}` +
          `  callId=${e.callId ?? "—"} sessionId=${e.sessionId} peer=${e.peer ?? "—"}` +
          `  ${e.type}`;
        const detail = e.detail ? `: ${e.detail}` : "";
        const meta =
          e.meta && Object.keys(e.meta).length > 0
            ? `  ${Object.entries(e.meta)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" ")}`
            : "";
        return `${base}${detail}${meta}`;
      })
      .join("\n");
  }
}
