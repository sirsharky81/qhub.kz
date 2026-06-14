"use client";

const STEPS = ["Загрузка", "Действие", "Готово"] as const;

interface StepIndicatorProps {
  step: 0 | 1 | 2;
}

export function StepIndicator({ step }: StepIndicatorProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center max-w-2xl mx-auto px-4 py-3 gap-2">
        {STEPS.map((label, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                    isActive
                      ? "bg-gray-900 text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-100 text-gray-400",
                  ].join(" ")}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span
                  className={[
                    "text-xs font-medium hidden sm:inline",
                    isActive ? "text-gray-900" : isDone ? "text-emerald-600" : "text-gray-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={[
                    "flex-1 h-px transition-colors",
                    isDone ? "bg-emerald-300" : "bg-gray-100",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
