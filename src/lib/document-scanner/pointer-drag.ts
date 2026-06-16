/** Document-level pointer drag — reliable on iOS Safari (avoids broken pointer capture retargeting). */
export function startPointerDrag(
  e: React.PointerEvent,
  onMove: (ev: PointerEvent) => void,
  onEnd?: () => void,
): void {
  e.preventDefault();
  e.stopPropagation();

  const move = (ev: PointerEvent) => {
    onMove(ev);
  };
  const end = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    onEnd?.();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

/** Minimum touch target per Apple HIG / WCAG (44×44 CSS px). */
export const TOUCH_HANDLE_PX = 44;

export const touchHandleOuterClass =
  "absolute z-10 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing";

export const touchHandleDotClass =
  "block w-5 h-5 rounded-full bg-gray-900 border-[1.5px] border-white shadow-md pointer-events-none";

export const touchResizeDotClass =
  "block w-4 h-4 rounded-full bg-gray-900 border-[1.5px] border-white shadow-md pointer-events-none cursor-nwse-resize";
