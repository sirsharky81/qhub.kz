"use client";

import { splitTextWithLinks } from "@/lib/messenger/linkify";
import { openExternalUrl } from "@/lib/platform/open-url";

interface Props {
  text: string;
  linkClassName?: string;
}

export function LinkifiedText({
  text,
  linkClassName = "",
}: Props) {
  return (
    <>
      {splitTextWithLinks(text).map((segment, index) =>
        segment.kind === "text" ? (
          <span key={`text-${index}`}>{segment.value}</span>
        ) : (
          <button
            key={`link-${index}`}
            type="button"
            className={`inline cursor-pointer break-words hyphens-auto text-left font-medium underline decoration-current/60 underline-offset-2 ${linkClassName}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void openExternalUrl(segment.href);
            }}
          >
            {segment.value}
          </button>
        ),
      )}
    </>
  );
}
