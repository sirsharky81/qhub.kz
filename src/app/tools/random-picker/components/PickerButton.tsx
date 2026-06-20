"use client";

interface PickerButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
}

export function PickerButton({
  children,
  onClick,
  disabled,
  disabledReason,
  variant = "primary",
  size = "sm",
  className = "",
  type = "button",
  ariaLabel,
}: PickerButtonProps) {
  const isDisabled = disabled ?? Boolean(disabledReason);
  const pad = size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm";

  const variants = {
    primary:
      "border-gray-900 bg-gray-900 text-white hover:bg-gray-800 shadow-sm disabled:bg-gray-400 disabled:border-gray-400",
    secondary:
      "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700",
    ghost:
      "border-transparent bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={isDisabled ? (disabledReason ?? undefined) : undefined}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-all active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function PickerSection({
  title,
  hint,
  children,
  compact = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div
        className={`border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50 ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2.5"
        }`}
      >
        <h3
          className={`font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          {title}
        </h3>
        {hint && (
          <p
            className={`text-gray-500 dark:text-gray-400 leading-snug ${
              compact ? "text-[10px] mt-0.5" : "text-[11px] mt-0.5"
            }`}
          >
            {hint}
          </p>
        )}
      </div>
      <div className={compact ? "p-2 space-y-2" : "p-3 space-y-3"}>{children}</div>
    </section>
  );
}
