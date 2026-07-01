function isMessengerKeyboardShellActive(): boolean {
  return document.documentElement.style.getPropertyValue("--messenger-vvh").length > 0;
}

/** Reset layout drift after iOS keyboard / input zoom (Safari PWA, Capacitor WebView). */
export function resetMobileViewport(): void {
  if (typeof window === "undefined") return;
  if (isMessengerKeyboardShellActive()) return;

  const apply = () => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    const vv = window.visualViewport;
    const top =
      vv && vv.offsetTop > 0
        ? Math.max(0, window.scrollY + vv.offsetTop)
        : window.scrollY;

    if (window.scrollX !== 0 || (vv && vv.offsetTop > 0)) {
      window.scrollTo(0, top);
    }
  };

  requestAnimationFrame(apply);
  window.setTimeout(apply, 80);
  window.setTimeout(apply, 320);
}

let guardInstalled = false;

/** Call once on app boot — keeps viewport pinned after keyboard / focus changes. */
export function installMobileViewportGuard(): void {
  if (guardInstalled || typeof window === "undefined") return;
  guardInstalled = true;

  const vv = window.visualViewport;
  vv?.addEventListener("resize", resetMobileViewport);
  vv?.addEventListener("scroll", resetMobileViewport);
  document.addEventListener("focusout", () => {
    window.setTimeout(resetMobileViewport, 100);
  });
}

/** Tailwind-friendly class: 16px on touch (no iOS zoom), smaller on desktop. */
export const MOBILE_SAFE_INPUT_CLASS = "text-base sm:text-sm";
