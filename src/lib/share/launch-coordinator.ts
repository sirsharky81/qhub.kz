const PRIMARY_LOCK = "qhub-share-launch-primary";

let primaryClaim: Promise<boolean> | null = null;

export function claimPrimaryShareLaunchWindow(): Promise<boolean> {
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
