"use client";

import Link from "next/link";

interface Props {
  href: string;
}

export function MessageMemberLink({ href }: Props) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center min-h-[40px] text-[10px] text-emerald-600 underline whitespace-nowrap py-1.5 pl-1 pr-2 self-center touch-manipulation"
      title="Написать сообщение"
      aria-label="Написать сообщение"
    >
      Сообщение
    </Link>
  );
}
