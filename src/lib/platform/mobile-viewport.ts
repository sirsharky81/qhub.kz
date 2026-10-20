function isMessengerKeyboardShellActive(): boolean {
  return document.documentElement.style.getPropertyValue("--messenger-vvh").length > 0;
}

function isDocumentVerticallyPinned(): boolean {
  return document.body.style.getPropertyValue("position") === "fixed";
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return t !== "checkbox" && t !== "radio" && t !== "range" && t !== "button" && t !== "submit";
  }
  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
}

/** Reset horizontal layout drift after iOS keyboard / input zoom (Safari PWA, Capacitor WebView). */
export function resetMobileViewport(): void {
  if (typeof window === "undefined") return;
  if (isMessengerKeyboardShellActive() || isDocumentVerticallyPinned()) return;

  const apply = () => {
    if (isMessengerKeyboardShellActive() || isDocumentVerticallyPinned()) return;

    if (document.documentElement.scrollLeft !== 0) {
      document.documentElement.scrollLeft = 0;
    }
    if (document.body.scrollLeft !== 0) {
      document.body.scrollLeft = 0;
    }
    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  };

  requestAnimationFrame(apply);
  window.setTimeout(apply, 100);
}

let guardInstalled = false;

/** Call once on app boot — resets horizontal viewport drift after closing keyboard. */
export function installMobileViewportGuard(): void {
  if (guardInstalled || typeof window === "undefined") return;
  guardInstalled = true;

  document.addEventListener("focusout", (event) => {
    if (!isEditableElement(event.target)) return;
    window.setTimeout(resetMobileViewport, 100);
  });
}

/** Tailwind-friendly class: 16px on touch (no iOS zoom), smaller on desktop. */
export const MOBILE_SAFE_INPUT_CLASS = "text-base sm:text-sm";
