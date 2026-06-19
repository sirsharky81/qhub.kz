const PRIMARY_LOCK = "qhub-music-launch-primary";

let primaryClaim: Promise<boolean> | null = null;

/**
 * Returns true when this window should own launch imports.
 * Secondary windows should hand off files and close instead of importing.
 */
export function claimPrimaryLaunchWindow(): Promise<boolean> {
  if (primaryClaim) return primaryClaim;

  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    primaryClaim = Promise.resolve(true);
    return primaryClaim;
  }

  primaryClaim = new Promise((resolve) => {
    void navigator.locks.request(PRIMARY_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }

      resolve(true);

      await new Promise<void>((release) => {
        window.addEventListener("pagehide", () => release(), { once: true });
      });
    });
  });

  return primaryClaim;
}
