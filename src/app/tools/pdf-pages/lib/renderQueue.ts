interface QueuedTask<T> {
  id: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Limits concurrent async work (e.g. pdf.js render tasks).
 */
export class RenderQueue {
  private queue: QueuedTask<unknown>[] = [];
  private activeCount = 0;
  private cancelled = false;
  private readonly cancelCallbacks = new Map<string, () => void>();

  constructor(private readonly concurrency: number) {}

  enqueue<T>(id: string, run: () => Promise<T>, onCancel?: () => void): Promise<T> {
    if (this.cancelled) {
      return Promise.reject(new Error("queue_cleared"));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      if (onCancel) {
        this.cancelCallbacks.set(id, onCancel);
      }
      this.pump();
    });
  }

  registerCancel(id: string, cancel: () => void): void {
    this.cancelCallbacks.set(id, cancel);
  }

  private pump(): void {
    while (!this.cancelled && this.activeCount < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeCount += 1;
      void task
        .run()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.cancelCallbacks.delete(task.id);
          this.pump();
        });
    }
  }

  clear(): void {
    this.cancelled = true;

    for (const task of this.queue) {
      task.reject(new Error("queue_cleared"));
    }
    this.queue = [];

    for (const cancel of this.cancelCallbacks.values()) {
      cancel();
    }
    this.cancelCallbacks.clear();
    this.activeCount = 0;
  }

  reset(): void {
    this.clear();
    this.cancelled = false;
  }
}
