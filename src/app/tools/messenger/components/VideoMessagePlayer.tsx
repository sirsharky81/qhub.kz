"use client";

import { useRef } from "react";

interface Props {
  src: string;
  mime?: string;
  mine?: boolean;
}

export function VideoMessagePlayer({ src, mime, mine }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      preload="metadata"
      className={`max-w-full rounded-lg ${mine ? "max-h-64" : "max-h-72"} w-full`}
      style={{ backgroundColor: "#000" }}
    >
      {mime && <source src={src} type={mime} />}
    </video>
  );
}
