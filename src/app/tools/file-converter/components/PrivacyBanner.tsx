"use client";

export function PrivacyBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
        <LockIcon />
        <span>Файлы не покидают устройство</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
      <LockIcon className="mt-0.5" />
      <p className="leading-snug">
        Все файлы обрабатываются локально на вашем устройстве. Ваши данные не
        покидают устройство.
      </p>
    </div>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}
