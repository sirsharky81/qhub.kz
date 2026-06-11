"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

export interface SwipeAction {
  id: string;
  label: string;
  className?: string;
  /** Если false — действие сразу, без диалога */
  confirm?: boolean;
  confirmTitle?: string;
  onAction: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  actions: SwipeAction[];
  enabled?: boolean;
  className?: string;
  contentClassName?: string;
}

export function SwipeableRow({
  children,
  actions,
  enabled = true,
  className = "",
  contentClassName = "bg-white",
}: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [confirmAction, setConfirmAction] = useState<SwipeAction | null>(null);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);

  const actionWidth = 52;
  const maxOffset = actions.length * actionWidth;
  const isOpen = offset < 0;

  const closeSwipe = useCallback(() => setOffset(0), []);

  const runAction = useCallback(
    (action: SwipeAction) => {
      const needsConfirm = action.confirm !== false;
      if (needsConfirm && action.confirmTitle) {
        setConfirmAction(action);
        return;
      }
      action.onAction();
      closeSwipe();
    },
    [closeSwipe],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled || actions.length === 0) return;
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current;
    const next = Math.max(-maxOffset, Math.min(0, startOffset.current + delta));
    setOffset(next);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    setOffset((prev) => (prev < -maxOffset / 3 ? -maxOffset : 0));
  };

  return (
    <>
      <div className={`relative overflow-hidden rounded-lg ${className}`}>
        <div
          className={`absolute inset-y-0 right-0 flex transition-opacity duration-150 ${
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ width: maxOffset }}
          aria-hidden={!isOpen}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => runAction(action)}
              className={`w-[52px] h-full flex items-center justify-center text-[10px] font-medium ${
                action.className ?? "bg-gray-800 text-white"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div
          className={`relative transition-transform duration-150 touch-manipulation ${contentClassName}`}
          style={{ transform: `translateX(${offset}px)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {children}
        </div>
      </div>

      {confirmAction && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="swipe-confirm-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <p id="swipe-confirm-title" className="text-sm font-medium text-gray-900">
              {confirmAction.confirmTitle}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  confirmAction.onAction();
                  setConfirmAction(null);
                  closeSwipe();
                }}
                className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
              >
                Подтвердить
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
