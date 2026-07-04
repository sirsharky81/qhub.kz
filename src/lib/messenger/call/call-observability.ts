const CALL_JOURNAL_FLAG = "qhub_call_journal";

export function isCallObservabilityEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CALL_JOURNAL_FLAG) === "1";
}

export function setCallObservabilityEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(CALL_JOURNAL_FLAG, "1");
    return;
  }
  window.localStorage.removeItem(CALL_JOURNAL_FLAG);
}
