import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

let workerInitialized = false;

/**
 * pdf.js v5.6+ expects newer JS APIs; polyfill when the runtime lacks them.
 */
function applyPdfJsPolyfills(): void {
  if (!("getOrInsertComputed" in Map.prototype)) {
    Object.defineProperty(Map.prototype, "getOrInsertComputed", {
      value<T>(this: Map<unknown, T>, key: unknown, callbackFn: (key: unknown) => T): T {
        if (this.has(key)) {
          return this.get(key) as T;
        }
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }

  if (!("withResolvers" in Promise)) {
    Object.defineProperty(Promise, "withResolvers", {
      value<T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      },
      writable: true,
      configurable: true,
    });
  }

  if (!("toHex" in Uint8Array.prototype)) {
    Object.defineProperty(Uint8Array.prototype, "toHex", {
      value(this: Uint8Array) {
        let hex = "";
        for (let i = 0; i < this.length; i++) {
          hex += this[i]!.toString(16).padStart(2, "0");
        }
        return hex;
      },
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Initializes the pdfjs worker once for all PDF tools.
 */
export async function initPdfWorker(): Promise<void> {
  if (workerInitialized || typeof window === "undefined") return;

  applyPdfJsPolyfills();

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  workerInitialized = true;
}

/**
 * Creates a pdf.js loading task for thumbnail rendering.
 */
export async function createPdfLoadingTask(data: Uint8Array): Promise<PDFDocumentLoadingTask> {
  await initPdfWorker();
  const pdfjs = await import("pdfjs-dist");
  return pdfjs.getDocument({ data: data.slice() });
}

/**
 * Loads a PDF document via pdfjs for thumbnail rendering.
 */
export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  const loadingTask = await createPdfLoadingTask(data);
  return loadingTask.promise;
}
