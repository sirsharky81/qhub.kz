"use client";

import type { EventInfo } from "@/lib/random-picker";

interface EventInfoFormProps {
  value: EventInfo;
  onChange: (value: EventInfo) => void;
}

export function EventInfoForm({ value, onChange }: EventInfoFormProps) {
  const set = (field: keyof EventInfo, v: string) => onChange({ ...value, [field]: v });

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Название мероприятия <span className="text-red-500">*</span>
        </span>
        <input
          type="text"
          value={value.eventName}
          onChange={(e) => set("eventName", e.target.value)}
          placeholder="Жеребьёвка турнира"
          className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </label>

      <label className="block">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Описание
        </span>
        <input
          type="text"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Необязательно"
          className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </label>

      <label className="block">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Контакт
        </span>
        <input
          type="text"
          value={value.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Telegram, email или телефон"
          className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </label>
    </div>
  );
}

export { isEventInfoValid } from "@/lib/random-picker/types";
