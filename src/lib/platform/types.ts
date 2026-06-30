export type PlatformErrorCode =
  | "PermissionDenied"
  | "LocationDisabled"
  | "NetworkOffline"
  | "GPSUnavailable"
  | "Timeout"
  | "NotSupportedOnPlatform"
  | "Unknown";

export type PlatformResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PlatformErrorCode; message: string };

export function platformOk<T>(value: T): PlatformResult<T> {
  return { ok: true, value };
}

export function platformErr<T>(
  code: PlatformErrorCode,
  message: string,
): PlatformResult<T> {
  return { ok: false, code, message };
}
