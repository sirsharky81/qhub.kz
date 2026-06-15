import { detectFromRgba, type DetectResult } from "./edge-detection-core";
import type { NormPoint } from "./types";
import { yieldToMain } from "./async-utils";

type WorkerReply =
  | { id: number; ok: true; result?: DetectResult; corners?: NormPoint[] }
  | { id: number; ok: false; error: string };

function normalizeReply(data: WorkerReply): DetectResult | null {
  if (!data.ok) return null;
  if (data.result?.corners?.length === 4) return data.result;
  if (data.corners?.length === 4) {
    return { corners: data.corners, confidence: 0.4 };
  }
  return null;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (r: DetectResult) => void; reject: (e: Error) => void }
>();

function runOnMainThread(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<DetectResult> {
  return yieldToMain().then(() => detectFromRgba(rgba, width, height));
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./detection.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        if (event.data.ok) {
          const result = normalizeReply(event.data);
          if (result) entry.resolve(result);
          else entry.reject(new Error("invalid worker response"));
          return;
        }
        entry.reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        workerFailed = true;
        worker?.terminate();
        worker = null;
        for (const [, entry] of pending) {
          entry.reject(new Error("worker error"));
        }
        pending.clear();
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
}

export function detectInWorker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<DetectResult> {
  const w = getWorker();
  if (!w) {
    return runOnMainThread(rgba, width, height);
  }

  const id = nextId++;
  const byteOffset = rgba.byteOffset;
  const byteLength = rgba.byteLength;
  const buffer = rgba.buffer.slice(byteOffset, byteOffset + byteLength);

  return new Promise<DetectResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage({ id, width, height, buffer }, [buffer]);
    } catch {
      pending.delete(id);
      workerFailed = true;
      void runOnMainThread(rgba, width, height).then(resolve, reject);
    }
  }).catch(() => runOnMainThread(rgba, width, height));
}

export function terminateDetectionWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}

export type { DetectResult };
