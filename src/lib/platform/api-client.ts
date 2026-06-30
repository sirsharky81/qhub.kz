import { isNativePlatform, NATIVE_API_BASE } from "./runtime";

export function getApiBaseUrl(): string {
  return isNativePlatform() ? NATIVE_API_BASE : "";
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

  const auth = await getMessengerBearerToken();
  if (auth && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${auth}`);
  }

  const url = resolveApiUrl(path);
  try {
    return await fetch(url, {
      ...rest,
      headers,
      credentials: isNativePlatform() ? "omit" : "same-origin",
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
