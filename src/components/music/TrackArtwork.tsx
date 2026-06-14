"use client";

import { useEffect, useState } from "react";

interface TrackArtworkProps {
  coverArtUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

const sizes = {
  sm: "w-7 h-7 rounded-md text-[10px]",
  md: "w-8 h-8 rounded-md text-xs",
};

export function TrackArtwork({ coverArtUrl, size = "sm", className = "" }: TrackArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [coverArtUrl]);

  const showCover = coverArtUrl && !failed;

  return (
    <div
      className={`overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center ${sizes[size]} ${className}`}
    >
      {showCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverArtUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/track-placeholder.png" alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}
