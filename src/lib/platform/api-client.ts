import { NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE } from "@/lib/captcha/turnstile-client";
import { getNativeApiBaseUrl, isNativePlatform } from "./runtime";

export function applyNativeClientHeaders(headers: Headers): void {
  if (!isNativePlatform()) return;
  if (!headers.has(NATIVE_CLIENT_HEADER)) {
    headers.set(NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE);
  }
}

export function getApiBaseUrl(): string {
  return getNativeApiBaseUrl();
}

export function resolveApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getApiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface ApiFetchInit extends RequestInit {
  /** Skip JSON Content-Type header */
  rawBody?: boolean;
}

export async function platformFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const { rawBody, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (!rawBody && rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  applyNativeClientHeaders(headers);

  const auth = await getMessengerBearerToken();
  if (auth && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${auth}`);
  }

  const url = resolveApiUrl(path);
  const remoteApi = Boolean(getApiBaseUrl());
  try {
    return await fetch(url, {
      ...rest,
      headers,
      credentials: remoteApi ? "omit" : (rest.credentials ?? "same-origin"),
    });
  } catch (err) {
    const hint = isNativePlatform()
      ? " Проверьте интернет и что www.qhub.kz доступен."
      : "";
    throw new Error(
      err instanceof Error && err.message === "Failed to fetch"
        ? `Нет связи с сервером.${hint}`
        : err instanceof Error
          ? err.message
          : "Ошибка сети",
    );
  }
}

/** Messenger session token stored in IndexedDB (see session-token.ts). */
async function getMessengerBearerToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { loadMessengerSessionToken } = await import("@/lib/messenger/session-token");
    return loadMessengerSessionToken();
  } catch {
    return null;
  }
}
