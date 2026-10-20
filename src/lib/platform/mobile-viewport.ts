function isMessengerKeyboardShellActive(): boolean {
  return document.documentElement.style.getPropertyValue("--messenger-vvh").length > 0;
}

function isDocumentVerticallyPinned(): boolean {
  return document.body.style.getPropertyValue("position") === "fixed";
}

function isEditableFocused(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  if (active instanceof HTMLInputElement) {
    const t = active.type;
    return t !== "checkbox" && t !== "radio" && t !== "range" && t !== "button" && t !== "submit";
  }
  return (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

/** Reset layout drift after iOS keyboard / input zoom (Safari PWA, Capacitor WebView). */
export function resetMobileViewport(): void {
  if (typeof window === "undefined") return;
  if (isMessengerKeyboardShellActive()) return;

  const apply = () => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    if (isDocumentVerticallyPinned()) return;

    const vv = window.visualViewport;
    const keyboardLikely = isEditableFocused();

    if (window.scrollX !== 0) {
      const top =
        vv && vv.offsetTop > 0 && keyboardLikely
          ? Math.max(0, window.scrollY + vv.offsetTop)
          : window.scrollY;
      window.scrollTo(0, top);
      return;
    }

    // visualViewport offsetTop also moves during top rubber-band — do not fight page scroll.
    if (vv && vv.offsetTop > 0 && keyboardLikely) {
      window.scrollTo(0, Math.max(0, window.scrollY + vv.offsetTop));
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
  document.addEventListener("focusout", () => {
    window.setTimeout(resetMobileViewport, 100);
  });
}

/** Tailwind-friendly class: 16px on touch (no iOS zoom), smaller on desktop. */
export const MOBILE_SAFE_INPUT_CLASS = "text-base sm:text-sm";
