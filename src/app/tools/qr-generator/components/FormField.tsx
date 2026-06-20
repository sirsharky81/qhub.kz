"use client";

export function FormField({
  label,
  children,
  error,
  hint,
  compact = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${compact ? "space-y-0.5" : "space-y-1"} ${className}`.trim()}>
      <span
        className={
          compact
            ? "text-[11px] font-medium text-gray-600 leading-tight"
            : "text-xs font-medium text-gray-700"
        }
      >
        {label}
      </span>
      {children}
      {hint && (
        <p className={`text-gray-500 leading-snug ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {hint}
        </p>
      )}
      {error && <p className={`text-red-600 ${compact ? "text-[10px]" : "text-[11px]"}`}>{error}</p>}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300";

export const inputClass = `${inputBase} px-3 py-2 text-sm`;

export const compactInputClass = `${inputBase} px-2 py-1.5 text-xs rounded-md`;

export const textareaClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y min-h-[80px]";

export const compactTextareaClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y min-h-[56px]";

export const selectClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300";

export const compactSelectClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300";

/** Общие классы компактных форм QR-генератора */
export const compactFormStack = "space-y-2 max-w-lg";
export const compactFormGrid = "grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5";
export const compactNoticeClass =
  "text-[10px] leading-snug rounded-md px-2 py-1.5 border";

export const checkboxClass = "rounded border-gray-300 text-gray-900 focus:ring-gray-400";
