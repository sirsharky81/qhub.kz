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
  tabs,
  activeTab,
  onTabChange,
  children,
  compact = false,
}: {
  title?: string;
  hint?: string;
  tabs?: { id: string; label: string; shortLabel?: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
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
        {tabs && tabs.length > 0 ? (
          <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap" role="tablist">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              const label = tab.shortLabel ? (
                <>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              );
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onTabChange?.(tab.id)}
                  className={`rounded-md px-2 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors text-center leading-tight min-w-0 sm:flex-initial ${
                    selected
                      ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <h3
            className={`font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide ${
              compact ? "text-[10px]" : "text-xs"
            }`}
          >
            {title}
          </h3>
        )}
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
