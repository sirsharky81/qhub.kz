"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDurationMs } from "@/lib/messenger/media-recorder";
import { MediaDownloadButton } from "./MediaDownloadButton";

interface Props {
  src: string;
  mime?: string;
  durationMs?: number;
  waveformPeaks?: number[];
  mine?: boolean;
  downloadBase64?: string;
  downloadFilename?: string;
}

let activeAudio: HTMLAudioElement | null = null;

export function stopActiveMessengerAudio(): void {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

export function AudioMessagePlayer({
  src,
  mime,
  durationMs,
  waveformPeaks,
  mine,
  downloadBase64,
  downloadFilename,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const totalMs = durationMs ?? 0;
  const peaks = waveformPeaks?.length ? waveformPeaks : Array.from({ length: 28 }, () => 0.35);

  const stopOthers = useCallback(() => {
    if (activeAudio && activeAudio !== audioRef.current) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    const onTime = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) {
        setCurrentMs(audio.currentTime * 1000);
        return;
      }
      setProgress(audio.currentTime / audio.duration);
      setCurrentMs(audio.currentTime * 1000);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentMs(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      if (activeAudio === audio) activeAudio = null;
    };
  }, [mime, src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    stopOthers();
    activeAudio = audio;
    void audio.play();
    setPlaying(true);
  }, [playing, stopOthers]);

  const barColor = mine ? "bg-white/70" : "bg-sky-500";
  const trackColor = mine ? "bg-white/25" : "bg-sky-100";

  return (
    <div className="flex items-center gap-2 min-w-[10rem] max-w-full">
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          mine ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"
        }`}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4 ml-0.5" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`flex items-end gap-0.5 h-6 ${trackColor} rounded-md px-1`}>
          {peaks.slice(0, 28).map((p, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${i / peaks.length <= progress ? barColor : mine ? "bg-white/30" : "bg-sky-300/60"}`}
              style={{ height: `${Math.max(15, p * 100)}%` }}
            />
          ))}
        </div>
        <p className={`text-[10px] mt-0.5 tabular-nums ${mine ? "text-sky-100" : "text-gray-500"}`}>
          {formatDurationMs(currentMs || 0)}
          {totalMs > 0 ? ` / ${formatDurationMs(totalMs)}` : ""}
        </p>
      </div>
      {downloadBase64 && downloadFilename && (
        <MediaDownloadButton
          base64={downloadBase64}
          mime={mime ?? "audio/webm"}
          filename={downloadFilename}
          mine={mine}
        />
      )}
    </div>
  );
}
