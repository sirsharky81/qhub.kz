"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

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

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.confirmTitle ?? ""}
        destructive
        onConfirm={() => {
          if (!confirmAction) return;
          confirmAction.onAction();
          setConfirmAction(null);
          closeSwipe();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
