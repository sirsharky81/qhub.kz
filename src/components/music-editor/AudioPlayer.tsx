"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimePrecise } from "@/lib/music-editor/format";

interface UseAudioPlayerOptions {
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number>(0);
  const playingRef = useRef(false);
  /** Пользователь хочет воспроизведение (не сбрасывается в stopSource). */
  const wantPlayingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  /** Актуальное время без ожидания React re-render (для canvas). */
  const currentTimeRef = useRef(0);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  const stopSource = useCallback((opts?: { keepPlayingState?: boolean }) => {
    if (sourceRef.current) {
      const src = sourceRef.current;
      sourceRef.current = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    if (!opts?.keepPlayingState) {
      setIsPlaying(false);
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sourceRef.current) return;
    const time = offsetRef.current + (ctx.currentTime - startTimeRef.current);
    const dur = bufferRef.current?.duration ?? 0;
    if (time >= dur) {
      stopSource();
      offsetRef.current = dur;
      setCurrentTime(dur);
      currentTimeRef.current = dur;
      options.onEnded?.();
      return;
    }
    setCurrentTime(time);
    currentTimeRef.current = time;
    options.onTimeUpdate?.(time);
    rafRef.current = requestAnimationFrame(tick);
  }, [options, stopSource]);

  const load = useCallback(
    (buffer: AudioBuffer) => {
      stopSource();
      bufferRef.current = buffer;
      setDuration(buffer.duration);
      setCurrentTime(0);
      currentTimeRef.current = 0;
      offsetRef.current = 0;
    },
    [stopSource],
  );

  const play = useCallback(
    (fromTime?: number) => {
      const buffer = bufferRef.current;
      if (!buffer) return;

      wantPlayingRef.current = true;
      stopSource({ keepPlayingState: true });
      const ctx = getCtx();
      if (ctx.state === "suspended") void ctx.resume();

      const offset = fromTime ?? offsetRef.current;
      offsetRef.current = Math.max(0, Math.min(offset, buffer.duration));
      setCurrentTime(offsetRef.current);
      currentTimeRef.current = offsetRef.current;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (sourceRef.current !== source) return;
        playingRef.current = false;
        wantPlayingRef.current = false;
        setIsPlaying(false);
        cancelAnimationFrame(rafRef.current);
        offsetRef.current = buffer.duration;
        setCurrentTime(buffer.duration);
        currentTimeRef.current = buffer.duration;
        sourceRef.current = null;
        options.onEnded?.();
      };
      source.start(0, offsetRef.current);
      sourceRef.current = source;
      startTimeRef.current = ctx.currentTime;
      playingRef.current = true;
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [getCtx, stopSource, tick, options],
  );

  const pause = useCallback(() => {
    wantPlayingRef.current = false;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed" && sourceRef.current) {
      offsetRef.current += ctx.currentTime - startTimeRef.current;
    }
    stopSource();
    setCurrentTime(offsetRef.current);
    currentTimeRef.current = offsetRef.current;
  }, [stopSource]);

  const stop = useCallback(() => {
    wantPlayingRef.current = false;
    stopSource();
    offsetRef.current = 0;
    setCurrentTime(0);
    currentTimeRef.current = 0;
  }, [stopSource]);

  const seek = useCallback(
    (time: number) => {
      const dur = bufferRef.current?.duration ?? duration;
      offsetRef.current = Math.max(0, Math.min(time, dur));
      setCurrentTime(offsetRef.current);
      currentTimeRef.current = offsetRef.current;
      if (wantPlayingRef.current) {
        play(offsetRef.current);
      }
    },
    [duration, play],
  );

  const skip = useCallback(
    (delta: number) => {
      seek(offsetRef.current + delta);
    },
    [seek],
  );

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  useEffect(() => {
    return () => {
      stopSource();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
      ctxRef.current = null;
    };
  }, [stopSource]);

  return {
    isPlaying,
    currentTime,
    currentTimeRef,
    duration,
    load,
    play,
    pause,
    stop,
    seek,
    skip,
    toggle,
  };
}

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  isRendering?: boolean;
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onSkipBack,
  onSkipForward,
  isRendering = false,
}: PlaybackControlsProps) {
  return (
    <div className="space-y-2">
      {isRendering && (
        <p className="text-[11px] text-amber-600 text-center">Подготовка звука...</p>
      )}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onSkipBack}
          className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-700"
          aria-label="Назад 5 секунд"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        {isPlaying ? (
          <button
            type="button"
            onClick={onPause}
            className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700"
            aria-label="Пауза"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700"
            aria-label="Воспроизвести"
          >
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onStop}
          className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-700"
          aria-label="Стоп"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onSkipForward}
          className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-700"
          aria-label="Вперёд 5 секунд"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 18l8.5-6L4 6v12zm2-6l8.5 6V6L6 12zm5 6V6l8.5 6L11 18z" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-14 text-right">
          <p className="text-[9px] text-gray-400">Сейчас</p>
          <p className="text-[11px] font-mono text-gray-900 tabular-nums">
            {formatTimePrecise(currentTime)}
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 accent-blue-600 h-1.5"
          aria-label="Текущее время"
        />
        <div className="w-14">
          <p className="text-[9px] text-gray-400">Всего</p>
          <p className="text-[11px] font-mono text-gray-500 tabular-nums">
            {formatTimePrecise(duration)}
          </p>
        </div>
      </div>
    </div>
  );
}
export function AudioPlayerBar({
  isPlaying,
  currentTime,
  duration,
  onToggle,
  onSeek,
}: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  onSeek: (time: number) => void;
}) {
  return (
    <PlaybackControls
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      onPlay={onToggle}
      onPause={onToggle}
      onStop={() => onSeek(0)}
      onSeek={onSeek}
      onSkipBack={() => onSeek(Math.max(0, currentTime - 5))}
      onSkipForward={() => onSeek(Math.min(duration, currentTime + 5))}
    />
  );
}
