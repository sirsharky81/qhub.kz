import { chooseAiMove } from "./search";
import type { ChessAiLevel } from "../types";
import type { ChessAiMove } from "./search";

type WorkerRequest = { id: number; fen: string; level: ChessAiLevel };
type WorkerReply =
  | { id: number; ok: true; move: ChessAiMove | null }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, fen, level } = event.data;
  try {
    const move = chooseAiMove(fen, level);
    const reply: WorkerReply = { id, ok: true, move };
    self.postMessage(reply);
  } catch (error) {
    const reply: WorkerReply = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : "AI search failed",
    };
    self.postMessage(reply);
  }
};

export {};
