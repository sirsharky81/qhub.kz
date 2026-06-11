"use client";

import { useFavorites } from "@/contexts/FavoritesContext";

interface PinButtonProps {
  appId: string;
  className?: string;
  size?: "sm" | "md";
  /** Всегда видима (для нижней строки карточки) */
  alwaysVisible?: boolean;
}

export function PinButton({
  appId,
  className = "",
  size = "md",
  alwaysVisible = false,
}: PinButtonProps) {
  const { isPinned, togglePin } = useFavorites();
  const pinned = isPinned(appId);
  const dim = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const star = size === "sm" ? "text-sm" : "text-base";

  const visibility =
    pinned || alwaysVisible
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 focus:opacity-100";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(appId);
      }}
      className={`${dim} rounded-full flex items-center justify-center transition-all duration-200 ${visibility} ${
        pinned
          ? "bg-white text-gray-900 border border-gray-200"
          : "bg-white/90 text-gray-400 border border-gray-200 hover:text-gray-700 hover:bg-gray-50"
      } ${className}`}
      aria-label={pinned ? "Открепить" : "Закрепить"}
      aria-pressed={pinned}
    >
      <span className={`${star} transition-transform duration-200 ${pinned ? "scale-110" : ""}`}>
        {pinned ? "★" : "☆"}
      </span>
    </button>
  );
}
