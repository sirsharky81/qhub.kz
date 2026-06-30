import { getApiBaseUrl } from "./api-client";
import { isNativePlatform } from "./runtime";

let installed = false;

/** Route all relative /api/* fetch calls to the remote Vercel backend in Capacitor. */
export function installNativeFetchPatch(): void {
  if (installed || typeof window === "undefined" || !isNativePlatform()) return;

  const base = getApiBaseUrl();
  if (!base) return;

  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url.startsWith("/api/")) {
      const absolute = `${base}${url}`;
      const credentials = init?.credentials ?? "omit";
      if (typeof input === "string") {
        return originalFetch(absolute, { ...init, credentials });
      }
      if (input instanceof Request) {
        return originalFetch(
          new Request(absolute, {
            method: input.method,
            headers: input.headers,
            body: input.body,
            mode: "cors",
            credentials,
            signal: input.signal,
            redirect: input.redirect,
          }),
          init,
        );
      }
      return originalFetch(absolute, { ...init, credentials });
    }

    return originalFetch(input, init);
  };
}

// Run as early as possible on the client (before React effects).
if (typeof window !== "undefined") {
  installNativeFetchPatch();
}
