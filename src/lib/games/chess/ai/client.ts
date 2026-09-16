import { chooseAiMove, type ChessAiMove } from "./search";
import type { ChessAiLevel } from "../types";

type WorkerReply =
  | { id: number; ok: true; move: ChessAiMove | null }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
const pending = new Map<number, { resolve: (move: ChessAiMove | null) => void; reject: (error: Error) => void }>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        if (event.data.ok) entry.resolve(event.data.move);
        else entry.reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        workerFailed = true;
        pending.forEach((item) => item.reject(new Error("AI worker failed")));
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    } catch {
      workerFailed = true;
      worker = null;
    }
  }
  return worker;
}

export function requestAiMove(fen: string, level: ChessAiLevel): Promise<ChessAiMove | null> {
  const active = getWorker();
  if (!active) {
    return Promise.resolve(chooseAiMove(fen, level));
  }
  const id = ++nextId;
  return new Promise<ChessAiMove | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    active.postMessage({ id, fen, level });
  }).catch(() => chooseAiMove(fen, level));
}
