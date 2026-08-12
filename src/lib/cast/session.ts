const CAST_PASSWORD_STORAGE_KEY = "qhub_cast_pending_password";

/** Stash a Send password in sessionStorage instead of the URL so it never
 * ends up in browser history, referrer headers, or server access logs. */
export function stashCastPendingPassword(password: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CAST_PASSWORD_STORAGE_KEY, password);
  } catch {
    /* ignore */
  }
}

export function takeCastPendingPassword(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(CAST_PASSWORD_STORAGE_KEY);
    sessionStorage.removeItem(CAST_PASSWORD_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}
