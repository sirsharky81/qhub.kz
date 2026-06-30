export const PlatformCrashReporting = {
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      console.error("[CrashReporting stub]", error, context);
    }
  },
  addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[Breadcrumb]", category, message, data);
    }
  },
  setUser(_userId: string): void {},
  startPerformanceTrace(name: string): { finish: () => void } {
    const start = Date.now();
    return {
      finish: () => {
        if (process.env.NODE_ENV !== "production") {
          console.debug(`[Trace] ${name}: ${Date.now() - start}ms`);
        }
      },
    };
  },
};
