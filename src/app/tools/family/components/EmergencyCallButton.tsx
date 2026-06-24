"use client";

interface Props {
  phone?: string | null;
}

export function EmergencyCallButton({ phone }: Props) {
  if (!phone) {
    return (
      <p className="text-xs text-gray-400 text-center leading-relaxed px-1">
        SOS-звонок появится, когда создатель укажет доверенный номер
      </p>
    );
  }

  return (
    <a
      href={`tel:${phone}`}
      className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 active:bg-red-100 touch-manipulation"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold">
        SOS
      </span>
      <span className="sm:hidden">Позвонить</span>
      <span className="hidden sm:inline">Позвонить по доверенному номеру</span>
    </a>
  );
}
