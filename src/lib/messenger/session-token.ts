import { PlatformStorage } from "@/lib/platform/storage";

const TOKEN_TABLE = "messenger";
const TOKEN_KEY = "session_token";

export async function saveMessengerSessionToken(token: string): Promise<void> {
  await PlatformStorage.set(TOKEN_TABLE, TOKEN_KEY, token);
}

export async function loadMessengerSessionToken(): Promise<string | null> {
  return PlatformStorage.get<string>(TOKEN_TABLE, TOKEN_KEY);
}

export async function clearMessengerSessionToken(): Promise<void> {
  await PlatformStorage.delete(TOKEN_TABLE, TOKEN_KEY);
}

/** Sync read for platformFetch — returns null until async load completes once. */
let cachedToken: string | null | undefined;

export function primeMessengerSessionTokenCache(token: string | null): void {
  cachedToken = token;
}

export function getCachedMessengerSessionToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  if (typeof window === "undefined") return null;
  void loadMessengerSessionToken().then((t) => {
    cachedToken = t;
  });
  return null;
}

// Hydrate cache on module load in browser
if (typeof window !== "undefined") {
  void loadMessengerSessionToken().then((t) => {
    cachedToken = t;
  });
}
