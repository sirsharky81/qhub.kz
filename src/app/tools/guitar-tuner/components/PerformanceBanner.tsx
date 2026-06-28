"use client";

export default function PerformanceBanner() {
  return (
    <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      Пониженная производительность: AudioWorklet недоступен, анализ на основном потоке (10 Hz).
    </div>
  );
}
