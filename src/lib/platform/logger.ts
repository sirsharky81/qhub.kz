import { PlatformCrashReporting } from "./crashReporting";

const isDev = process.env.NODE_ENV !== "production";

export const PlatformLogger = {
  debug(message: string, data?: unknown): void {
    if (isDev) console.debug(`[QHub] ${message}`, data ?? "");
  },
  info(message: string, data?: unknown): void {
    console.info(`[QHub] ${message}`, data ?? "");
  },
  warn(message: string, data?: unknown): void {
    console.warn(`[QHub] ${message}`, data ?? "");
  },
  error(message: string, error?: Error, data?: unknown): void {
    console.error(`[QHub] ${message}`, error ?? "", data ?? "");
    if (error) PlatformCrashReporting.captureException(error, { message, data });
  },
};
