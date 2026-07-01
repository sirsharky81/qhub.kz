import { applyNativeClientHeaders, getApiBaseUrl } from "./api-client";
import { isNativePlatform } from "./runtime";

function withNativeClientHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  applyNativeClientHeaders(headers);
  return { ...init, headers };
}

let installed = false;

/** Route relative /api/* to remote backend only in bundled Capacitor shell (https://localhost). */
export function installNativeFetchPatch(): void {
  if (installed || typeof window === "undefined") return;

  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isNativePlatform()) {
      return originalFetch(input, init);
    }

    const base = getApiBaseUrl();
    if (!base) {
      return originalFetch(input, init);
    }

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (!url.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const absolute = `${base}${url}`;
    const credentials = init?.credentials ?? "omit";
    const patchedInit = withNativeClientHeaders(init);
    if (typeof input === "string") {
      return originalFetch(absolute, { ...patchedInit, credentials });
    }
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      applyNativeClientHeaders(headers);
      return originalFetch(
        new Request(absolute, {
          method: input.method,
          headers,
          body: input.body,
          mode: "cors",
          credentials,
          signal: input.signal,
          redirect: input.redirect,
        }),
        patchedInit,
      );
    }
    return originalFetch(absolute, { ...patchedInit, credentials });
  };
}

// Run as early as possible on the client (before React effects).
if (typeof window !== "undefined") {
  installNativeFetchPatch();
}
