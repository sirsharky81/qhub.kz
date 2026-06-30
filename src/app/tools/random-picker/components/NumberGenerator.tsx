"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSecureRandomInt,
  getSecureRandomFloat,
  addNumberHistory,
  getNumberHistory,
  clearNumberHistory,
  copyToClipboard,
  createNumberHistoryEntry,
  type NumberHistoryEntry,
} from "@/lib/random-picker";

import { PickerButton, PickerSection } from "./PickerButton";

export function NumberGenerator() {
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("100");
  const [result, setResult] = useState<NumberHistoryEntry | null>(null);
  const [history, setHistory] = useState<NumberHistoryEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHistory(getNumberHistory());
  }, []);

  const generate = useCallback(async () => {
    const lo = parseInt(min, 10);
    const hi = parseInt(max, 10);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    const value = getSecureRandomInt(lo, hi);
    const entry = await createNumberHistoryEntry(lo, hi, value);
    setResult(entry);
    addNumberHistory(entry);
    setHistory(getNumberHistory());
  }, [min, max]);

  const handleCopy = async () => {
    if (!result) return;
    const text = [
      `Результат: ${result.value}`,
      `Диапазон: ${result.min}–${result.max}`,
      `Seed: ${result.seed}`,
      `Verification Hash: ${result.verificationHash}`,
    ].join("\n");
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClearHistory = () => {
    clearNumberHistory();
    setHistory([]);
  };

  return (
    <PickerSection title="Диапазон">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Минимум</span>
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Максимум</span>
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <PickerButton onClick={generate} className="w-full">
        Сгенерировать
      </PickerButton>

      {result && (
        <div className="text-center py-8" aria-live="polite" aria-atomic="true">
          <p className="text-6xl sm:text-7xl font-bold text-gray-900 dark:text-white tabular-nums">
            {result.value}
          </p>
          <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-xs font-mono text-gray-500 dark:text-gray-400 break-all text-left max-w-md mx-auto">
            <p>Seed: {result.seed.slice(0, 32)}…</p>
            <p>Hash: {result.verificationHash.slice(0, 32)}…</p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {copied ? "Скопировано!" : "Копировать результат"}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">История</h4>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-xs text-red-500 hover:underline"
              aria-label="Очистить историю чисел"
            >
              Очистить
            </button>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {history.map((h) => (
              <li
                key={h.id}
                className="text-sm text-gray-600 dark:text-gray-400 flex justify-between"
              >
                <span className="font-mono font-medium text-gray-900 dark:text-gray-200">
                  {h.value}
                </span>
                <span className="text-xs">
                  [{h.min}–{h.max}]{" "}
                  {new Date(h.timestamp).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PickerSection>
  );
}

/** Play a short tick sound via Web Audio API */
export function playTickSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800 + getSecureRandomFloat() * 400;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    /* audio not available */
  }
}

export function playWinSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* audio not available */
  }
}

export function useVideoRecorder(containerRef: React.RefObject<HTMLElement | null>) {
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    const el = containerRef.current;
    if (!el || !navigator.mediaDevices?.getDisplayMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: false,
      });
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setVideoUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      return true;
    } catch {
      return false;
    }
  }, [containerRef]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const downloadVideo = useCallback(() => {
    if (!videoUrl) return;
    void fetch(videoUrl)
      .then((r) => r.blob())
      .then((blob) =>
        import("@/lib/platform/save-file").then(({ saveBlobToDevice }) =>
          saveBlobToDevice(blob, `qhub-random-picker-${Date.now()}.webm`),
        ),
      );
  }, [videoUrl]);

  return { recording, videoUrl, startRecording, stopRecording, downloadVideo };
}
