"use client";

import { MAIL_FILTER_LABELS, type MailFilter } from "@/lib/mail/web/constants";

interface Props {
  filter: MailFilter;
  onChange: (filter: MailFilter) => void;
}

const FILTERS: MailFilter[] = ["all", "unread", "flagged", "attachments"];

export function MailFilterMenu({ filter, onChange }: Props) {
  return (
    <div className="absolute right-0 top-full mt-2 z-30 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl py-1">
      {FILTERS.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`w-full px-4 py-2.5 text-left text-sm ${
            filter === item ? "text-sky-400 bg-zinc-800" : "text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          {MAIL_FILTER_LABELS[item]}
        </button>
      ))}
    </div>
  );
}
