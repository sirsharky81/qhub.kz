"use client";

import { useRef } from "react";
import { MediaDownloadButton } from "./MediaDownloadButton";

interface Props {
  src: string;
  mime?: string;
  mine?: boolean;
  downloadBase64?: string;
  downloadFilename?: string;
}

export function VideoMessagePlayer({
  src,
  mime,
  mine,
  downloadBase64,
  downloadFilename,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="relative max-w-full">
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
      {downloadBase64 && downloadFilename && (
        <div className="absolute top-2 right-2">
          <MediaDownloadButton
            base64={downloadBase64}
            mime={mime ?? "video/webm"}
            filename={downloadFilename}
            mine
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}
