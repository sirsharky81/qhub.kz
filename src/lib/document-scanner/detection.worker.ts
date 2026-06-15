import { detectFromRgba } from "./edge-detection-core";
import type { DetectResult } from "./edge-detection-core";

type WorkerRequest = { id: number; width: number; height: number; buffer: ArrayBuffer };
type WorkerReply =
  | { id: number; ok: true; result: DetectResult }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, width, height, buffer } = event.data;
  try {
    const rgba = new Uint8ClampedArray(buffer);
    const result = detectFromRgba(rgba, width, height);
    const reply: WorkerReply = { id, ok: true, result };
    self.postMessage(reply);
  } catch (err) {
    const reply: WorkerReply = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : "detection failed",
    };
    self.postMessage(reply);
  }
};

export {};
