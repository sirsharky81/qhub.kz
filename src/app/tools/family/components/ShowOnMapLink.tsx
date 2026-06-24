"use client";

import Link from "next/link";

interface Props {
  href: string;
}

export function ShowOnMapLink({ href }: Props) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center min-h-[44px] text-[11px] sm:text-xs text-sky-600 underline whitespace-nowrap py-2 pl-2 pr-3 self-center touch-manipulation"
    >
      На карте
    </Link>
  );
}
