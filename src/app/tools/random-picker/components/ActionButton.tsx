"use client";

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  className?: string;
}

export function ActionButton({
  children,
  onClick,
  disabled,
  disabledReason,
  className = "",
}: ActionButtonProps) {
  const isDisabled = disabled ?? Boolean(disabledReason);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={isDisabled ? (disabledReason ?? undefined) : undefined}
      aria-disabled={isDisabled}
      className={`w-full rounded-xl bg-gray-900 dark:bg-blue-600 text-white py-3 font-medium disabled:opacity-40 hover:opacity-90 transition-opacity ${className}`}
    >
      {children}
    </button>
  );
}
