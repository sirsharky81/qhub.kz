"use client";

import { MAIL_FILTER_LABELS, type MailFilter } from "@/lib/mail/web/constants";

interface Props {
  filter: MailFilter;
  onChange: (filter: MailFilter) => void;
}

const FILTERS: MailFilter[] = ["all", "unread", "flagged", "attachments"];

export function MailFilterMenu({ filter, onChange }: Props) {
  return (
    <div className="absolute right-0 top-full mt-2 z-30 w-56 rounded-xl border border-gray-200 bg-white shadow-lg py-1">
      {FILTERS.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`w-full px-4 py-2.5 text-left text-sm ${
            filter === item ? "text-sky-700 bg-sky-50 font-medium" : "text-gray-800 hover:bg-gray-50"
          }`}
        >
          {MAIL_FILTER_LABELS[item]}
        </button>
      ))}
    </div>
  );
}
