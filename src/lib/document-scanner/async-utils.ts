import { downscaleCanvas } from "./canvas-utils";

/** Yield control back to the browser so the UI can update. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Downscale in halving steps so the UI can repaint between passes. */
export async function downscaleCanvasAsync(
  canvas: HTMLCanvasElement,
  maxDim: number,
): Promise<HTMLCanvasElement> {
  let current = canvas;
  while (Math.max(current.width, current.height) > maxDim * 1.6) {
    await yieldToMain();
    const half = Math.max(current.width, current.height) / 2;
    current = downscaleCanvas(current, half);
  }
  await yieldToMain();
  return downscaleCanvas(current, maxDim);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "timeout",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
