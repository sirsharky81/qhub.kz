const SESSION_ID = "1c0a94";
const INGEST_URL = "http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e";
const STORAGE_KEY = "qhub-debug-1c0a94";
const MAX_EVENTS = 200;

export type DebugHypothesis =
  | "H1-handlers"
  | "H2-cache"
  | "H3-position"
  | "H4-pwa-play"
  | "H5-navigation"
  | "H6-seekto"
  | "H7-zombie";

export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId: DebugHypothesis = "H1-handlers",
  runId = "pre-fix",
): void {
  // runId passed by caller; post-fix runs tagged explicitly
  if (typeof window === "undefined") return;

  const entry = {
    sessionId: SESSION_ID,
    runId,
    hypothesisId,
    location,
    message,
    data: {
      ...data,
      pwa: window.matchMedia("(display-mode: standalone)").matches,
      hidden: document.hidden,
      ua: navigator.userAgent.slice(0, 80),
    },
    timestamp: Date.now(),
  };

  // #region agent log
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as typeof entry[];
    prev.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(-MAX_EVENTS)));
  } catch {
    /* ignore */
  }

  fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION_ID },
    body: JSON.stringify(entry),
  }).catch(() => {});

  fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});
  // #endregion
}

export function getAgentDebugLogs(): string {
  if (typeof window === "undefined") return "[]";
  return localStorage.getItem(STORAGE_KEY) ?? "[]";
}

export function clearAgentDebugLogs(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
