import {
  prepareAudioSessionForCapture,
  restoreAudioSessionAfterCapture,
} from "@/lib/audio-session";
import { getNativePlatform, isNativePlatform } from "@/lib/platform/runtime";
import {
  MAX_AUDIO_BLOB_BYTES,
  MAX_VIDEO_BLOB_BYTES,
  MAX_VIDEO_DURATION_MS,
  MAX_VOICE_DURATION_MS,
} from "./constants";

export type MediaRecordMode = "audio" | "video";
export type FacingMode = "user" | "environment";

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

const AUDIO_MIME_IOS = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4",
];

const VIDEO_MIME_IOS = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus"];

/** Chrome on Android defaults to H.264 in WebM; forcing vp8 often yields audio-only blobs. */
const VIDEO_MIME_ANDROID = [
  "video/webm",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9,opus",
];

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidRecorder(): boolean {
  if (isNativePlatform() && getNativePlatform() === "android") return true;
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function mimeCandidates(mode: MediaRecordMode): string[] {
  if (isAppleMobile()) {
    return mode === "audio" ? AUDIO_MIME_IOS : VIDEO_MIME_IOS;
  }
  if (mode === "video" && isAndroidRecorder()) return VIDEO_MIME_ANDROID;
  return mode === "audio" ? AUDIO_MIME_CANDIDATES : VIDEO_MIME_CANDIDATES;
}

function videoConstraints(facing: FacingMode): MediaTrackConstraints {
  if (isAndroidRecorder()) {
    return {
      facingMode: facing,
      width: { ideal: 640, max: 640 },
      height: { ideal: 480, max: 480 },
      frameRate: { ideal: 24, max: 24 },
    };
  }
  return {
    facingMode: facing,
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
  };
}

function createRecorderForStream(
  mediaStream: MediaStream,
  mode: MediaRecordMode,
): { recorder: MediaRecorder; mime: string } {
  for (const candidate of mimeCandidates(mode)) {
    if (!MediaRecorder.isTypeSupported(candidate)) continue;
    try {
      const options: MediaRecorderOptions = { mimeType: candidate };
      if (mode === "video") {
        options.videoBitsPerSecond = 1_000_000;
        options.audioBitsPerSecond = 96_000;
      }
      const recorder = new MediaRecorder(mediaStream, options);
      return { recorder, mime: recorder.mimeType || candidate };
    } catch {
      /* try next mime */
    }
  }
  const recorder = new MediaRecorder(mediaStream);
  const fallbackMime =
    recorder.mimeType || (mode === "audio" ? "audio/webm" : "video/webm");
  return { recorder, mime: fallbackMime };
}

export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of mimeCandidates("audio")) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of mimeCandidates("video")) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function canRecordMedia(mode: MediaRecordMode): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === "undefined") return false;
  return mode === "audio" ? pickAudioMime() !== null : pickVideoMime() !== null;
}

export function mediaRecordingErrorMessage(err: unknown, mode: MediaRecordMode): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return mode === "audio"
        ? "Нет доступа к микрофону — разрешите в Настройки → Safari → Микрофон"
        : "Нет доступа к камере — разрешите в Настройки → Safari → Камера";
    }
    if (err.name === "NotFoundError") {
      return mode === "audio" ? "Микрофон не найден" : "Камера не найдена";
    }
    if (err.name === "NotReadableError") {
      return "Устройство занято другим приложением";
    }
    if (err.message.includes("AudioSession")) {
      return "Не удалось включить микрофон — остановите воспроизведение и повторите";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Не удалось начать запись";
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** True when the blob contains decodable video frames (not audio-only). */
export async function videoBlobHasFrames(blob: Blob): Promise<boolean> {
  if (typeof document === "undefined") return true;
  if (!blob.type.startsWith("video/")) return false;
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(), 4000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("metadata load failed"));
      };
    });
    return video.videoWidth > 0 && video.videoHeight > 0;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractWaveformPeaks(blob: Blob, points = 32): Promise<number[]> {
  try {
    const ctx = new AudioContext();
    const buffer = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / points));
    const peaks: number[] = [];
    for (let i = 0; i < points; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.001);
    await ctx.close();
    return peaks.map((p) => p / top);
  } catch {
    return Array.from({ length: points }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i * 0.5)));
  }
}

export interface MediaRecorderSession {
  mode: MediaRecordMode;
  start(): Promise<void>;
  stop(): Promise<{ blob: Blob; durationMs: number; mime: string }>;
  switchCamera(): Promise<void>;
  getStream(): MediaStream | null;
  getFacingMode(): FacingMode;
  getElapsedMs(): number;
  dispose(): void;
}

export async function createMediaRecorderSession(options: {
  mode: MediaRecordMode;
  facingMode?: FacingMode;
  onAutoStop?: () => void;
}): Promise<MediaRecorderSession> {
  const mode = options.mode;
  let facingMode: FacingMode = options.facingMode ?? "user";
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let mime = mode === "audio" ? pickAudioMime() : pickVideoMime();
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  let maxMs = mode === "audio" ? MAX_VOICE_DURATION_MS : MAX_VIDEO_DURATION_MS;

  if (!mime) {
    throw new Error("Запись не поддерживается в этом браузере");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Запись не поддерживается в этом браузере");
  }

  async function attachStream(nextFacing: FacingMode) {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    const constraints: MediaStreamConstraints =
      mode === "audio"
        ? { audio: true }
        : { audio: true, video: videoConstraints(nextFacing) };
    prepareAudioSessionForCapture();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    facingMode = nextFacing;
  }

  async function startRecorder(clearChunks = true) {
    if (!stream) await attachStream(facingMode);
    if (clearChunks) chunks = [];
    const created = createRecorderForStream(stream!, mode);
    recorder = created.recorder;
    mime = created.mime;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    if (isAndroidRecorder()) {
      recorder.start();
    } else {
      recorder.start(250);
    }
    startedAt = Date.now();
    if (autoStopTimer) clearTimeout(autoStopTimer);
    autoStopTimer = setTimeout(() => {
      if (recorder?.state === "recording") {
        recorder.stop();
        options.onAutoStop?.();
      }
    }, maxMs);
  }

  return {
    mode,
    async start() {
      await startRecorder();
    },
    async stop() {
      if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
      }
      if (!recorder || recorder.state === "inactive") {
        throw new Error("Запись не начата");
      }
      const durationMs = Date.now() - startedAt;
      const resultMime = mime!;
      const blob = await new Promise<Blob>((resolve, reject) => {
        if (!recorder) {
          reject(new Error("no recorder"));
          return;
        }
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: resultMime }));
        };
        recorder.onerror = () => reject(new Error("Ошибка записи"));
        recorder.stop();
      });
      recorder = null;
      const maxBytes = mode === "audio" ? MAX_AUDIO_BLOB_BYTES : MAX_VIDEO_BLOB_BYTES;
      if (blob.size > maxBytes) {
        throw new Error(
          mode === "audio" ? "Голосовое слишком длинное" : "Видео слишком большое — запишите короче",
        );
      }
      return { blob, durationMs, mime: resultMime };
    },
    async switchCamera() {
      if (mode !== "video") return;
      const wasRecording = recorder?.state === "recording";
      if (wasRecording && recorder) {
        await new Promise<void>((resolve) => {
          recorder!.addEventListener("stop", () => resolve(), { once: true });
          recorder!.stop();
        });
      }
      facingMode = facingMode === "user" ? "environment" : "user";
      await attachStream(facingMode);
      if (wasRecording) await startRecorder(false);
    },
    getStream() {
      return stream;
    },
    getFacingMode() {
      return facingMode;
    },
    getElapsedMs() {
      return startedAt ? Date.now() - startedAt : 0;
    },
    dispose() {
      if (autoStopTimer) clearTimeout(autoStopTimer);
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recorder = null;
      restoreAudioSessionAfterCapture();
    },
  };
}
