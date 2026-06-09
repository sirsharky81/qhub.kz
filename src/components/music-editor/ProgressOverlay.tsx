"use client";

interface ProgressOverlayProps {
  message: string;
  progress: number;
}

export function ProgressOverlay({ message, progress }: ProgressOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-6 w-full max-w-sm space-y-4">
        <p className="text-sm font-medium text-gray-900 text-center">{message}</p>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-center font-mono">{progress}%</p>
      </div>
    </div>
  );
}
