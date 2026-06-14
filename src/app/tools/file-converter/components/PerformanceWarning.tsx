"use client";

export function PerformanceWarning() {
  return (
    <div className="flex items-start gap-3 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <div
        className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0"
        aria-hidden
      >
        <DeviceSpeedIcon className="w-4 h-4 text-violet-500" />
      </div>
      <p className="leading-snug pt-0.5">
        <span className="text-gray-900 font-medium">Обработка на вашем устройстве.</span>{" "}
        Скорость зависит от его производительности — учитывайте размер файла и
        возможности телефона или компьютера.
      </p>
    </div>
  );
}

export function UnsupportedFormatAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
    >
      <div
        className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0"
        aria-hidden
      >
        <AlertIcon className="w-4 h-4 text-red-500" />
      </div>
      <p className="leading-snug pt-0.5">{message}</p>
    </div>
  );
}

function DeviceSpeedIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}
