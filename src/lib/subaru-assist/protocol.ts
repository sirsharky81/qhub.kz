export interface AssistElmRequest {
  t: "elm";
  id: string;
  command: string;
  timeoutMs?: number;
}

export interface AssistElmResponse {
  t: "elm-res";
  id: string;
  ok: boolean;
  raw?: string;
  error?: string;
}

export interface AssistStatusFrame {
  t: "status";
  code: string;
}

export type AssistFrame = AssistElmRequest | AssistElmResponse | AssistStatusFrame;

export function parseAssistFrame(raw: string): AssistFrame | null {
  try {
    const msg = JSON.parse(raw) as AssistFrame;
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return null;
    if (msg.t === "elm" && typeof (msg as AssistElmRequest).id === "string") return msg;
    if (msg.t === "elm-res" && typeof (msg as AssistElmResponse).id === "string") return msg;
    if (msg.t === "status" && typeof (msg as AssistStatusFrame).code === "string") return msg;
    return null;
  } catch {
    return null;
  }
}
