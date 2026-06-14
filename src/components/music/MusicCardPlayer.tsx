"use client";

import type { CSSProperties, SyntheticEvent } from "react";
import { SeekBar } from "@/components/music/SeekBar";
import { useMusicPlayerOptional } from "@/contexts/MusicPlayerContext";

const btnSm =
  "w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:scale-95 transition-all shrink-0 touch-manipulation";

const btnActive =
  "w-7 h-7 rounded-full border border-gray-300 bg-gray-200 flex items-center justify-center text-gray-900 active:scale-95 transition-all shrink-0 touch-manipulation";

/** Блокирует клик по Link-оверлею карточки, не отменяя нативное поведение range-input. */
function stopControlBubble(e: SyntheticEvent) {
  e.stopPropagation();
}

function IconMute({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9.99 9.99 0 0 0 8.59-2.12l2.3 2.3L21 19.73 19.73 21l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

interface MusicCardPlayerProps {
  embedded?: boolean;
  isPlaying?: boolean;
}

export function MusicCardPlayer({ embedded = false, isPlaying: isPlayingProp }: MusicCardPlayerProps) {
  const player = useMusicPlayerOptional();
  if (!player?.currentTrack) return null;

  const {
    currentTrack,
    status,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    getLiveTime,
    togglePlay,
    previous,
    next,
    stop,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = player;
  const isPlaying = isPlayingProp ?? status === "playing";

  const shell = embedded
    ? "flex flex-col gap-2 shrink-0"
    : "rounded-xl border border-gray-200/80 bg-white/90 shadow-sm p-3 space-y-3";

  const surface =
    "rounded-xl border border-gray-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";

  return (
    <div className={shell}>
      <div className={`${surface} p-2 space-y-2`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 transition-all border ${
              isPlaying ? "border-gray-400 shadow-sm" : "border-gray-200"
            }`}
          >
            {currentTrack.coverArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentTrack.coverArtUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/track-placeholder.png" alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate leading-snug tracking-tight">
              {currentTrack.title}
            </p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        <SeekBar
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onSeek={seek}
          getLiveTime={getLiveTime}
          compact
          variant="embedded"
          interactive={embedded}
        />
      </div>

      <div
        className="pointer-events-auto relative z-20 w-full rounded-xl border border-gray-200 bg-white px-1.5 py-1.5 shadow-sm"
        onClick={stopControlBubble}
      >
        <div className="flex items-center gap-1 w-full overflow-x-auto scrollbar-none">
          <div className="inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={toggleShuffle}
              className={shuffle ? btnActive : btnSm}
              aria-label="Перемешать"
              aria-pressed={shuffle}
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>
            <button type="button" onClick={() => void previous()} className={btnSm} aria-label="Предыдущий">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:opacity-90 active:scale-95 shrink-0 touch-manipulation shadow-sm"
              aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
            >
              {isPlaying ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 ml-px" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button type="button" onClick={() => void next()} className={btnSm} aria-label="Следующий">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={repeat !== "none" ? btnActive : btnSm}
              aria-label="Повтор"
              aria-pressed={repeat !== "none"}
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
            </button>
            <button type="button" onClick={stop} className={btnSm} aria-label="Стоп">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          </div>

          <span className="w-px h-5 bg-gray-200 shrink-0 mx-0.5" aria-hidden />

          <div className="inline-flex items-center gap-1.5 shrink-0 pr-0.5">
            <button
              type="button"
              onClick={toggleMute}
              className={isMuted ? btnActive : btnSm}
              aria-label={isMuted ? "Включить звук" : "Без звука"}
              aria-pressed={isMuted}
            >
              <IconMute muted={isMuted} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              onInput={(e) => setVolume(Number(e.currentTarget.value))}
              onPointerDown={stopControlBubble}
              onClick={stopControlBubble}
              style={{ "--vol-pct": `${Math.round(volume * 100)}%` } as CSSProperties}
              className="music-volume-slider w-16 sm:w-[4.5rem] h-5 cursor-pointer shrink-0 touch-manipulation"
              aria-label="Громкость"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
