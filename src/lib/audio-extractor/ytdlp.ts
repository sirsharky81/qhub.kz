import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import type { AudioPlatform, VideoMetadata } from "./types";
import { MAX_DURATION_SEC, MAX_STREAM_BYTES } from "./constants";
import { resolveCookiesPath, resolveYtdlpBinary } from "./resolve-ytdlp";
import { fetchYoutubeAudioViaFallback, fetchYoutubeMetadataViaFallback } from "./piped-fallback";
import { isVercelRuntime } from "./runtime-env";
import { isYoutubeUrl } from "./youtube-id";

export class YtdlpError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "unavailable"
      | "too_long"
      | "timeout"
      | "blocked"
      | "unknown",
  ) {
    super(message);
    this.name = "YtdlpError";
  }
}

const YOUTUBE_CLIENTS = [
  "android,web;player_skip=webpage,configs",
  "ios,web;player_skip=webpage,configs",
  "mweb,web;player_skip=webpage,configs",
];

function spawnError(err: NodeJS.ErrnoException): YtdlpError {
  if (err.code === "ENOENT") {
    return new YtdlpError("Сервис временно недоступен (yt-dlp не найден)", "not_found");
  }
  return new YtdlpError(err.message || "Не удалось запустить yt-dlp", "unknown");
}

function mapExtractor(extractor?: string): AudioPlatform {
  const key = (extractor ?? "").toLowerCase();
  if (key.includes("tiktok")) return "tiktok";
  if (key.includes("instagram")) return "instagram";
  return "youtube";
}

function classifyYtdlpError(stderr: string, stdout: string): YtdlpError {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  console.error("[ytdlp] stderr:", stderr.slice(0, 2000));

  if (
    text.includes("private video") ||
    text.includes("this video is unavailable") ||
    text.includes("video unavailable")
  ) {
    return new YtdlpError("Видео недоступно", "unavailable");
  }
  if (text.includes("format is not available")) {
    return new YtdlpError("Не удалось обработать ссылку", "unknown");
  }
  if (
    text.includes("geo") ||
    text.includes("country") ||
    text.includes("not a bot") ||
    text.includes("confirm you're not") ||
    text.includes("sign in to confirm") ||
    (text.includes("cookies") && text.includes("youtube"))
  ) {
    return new YtdlpError(
      "YouTube временно блокирует запросы с сервера. Попробуйте позже или другую ссылку.",
      "blocked",
    );
  }
  if (text.includes("sign in") || text.includes("login")) {
    return new YtdlpError("Требуется авторизация на платформе", "blocked");
  }
  return new YtdlpError("Не удалось обработать ссылку", "unknown");
}

function baseArgs(url: string, youtubeClient?: string): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-color",
    "--no-progress",
    "--retries",
    "3",
    "--socket-timeout",
    "20",
  ];

  if (/youtube\.com|youtu\.be/i.test(url)) {
    const client = youtubeClient ?? YOUTUBE_CLIENTS[0];
    args.push("--extractor-args", `youtube:player_client=${client}`);
  }

  const cookies = resolveCookiesPath();
  if (cookies) args.push("--cookies", cookies);

  return args;
}

function youtubeClients(): (string | undefined)[] {
  if (isVercelRuntime()) return YOUTUBE_CLIENTS;
  // Local dev: default yt-dlp client first (more formats, fewer false failures).
  return [undefined, ...YOUTUBE_CLIENTS];
}

function shouldUseYoutubeFallback(err: unknown): boolean {
  if (!isVercelRuntime()) return false;
  if (!(err instanceof YtdlpError)) return true;
  if (err.code === "too_long" || err.code === "unavailable") return false;
  return true;
}

function runProcess(args: string[], timeoutMs: number): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = resolveYtdlpBinary();
    } catch (err) {
      reject(err);
      return;
    }

    try {
      chmodSync(bin, 0o755);
    } catch {
      /* ignore */
    }

    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new YtdlpError("Превышено время ожидания", "timeout"));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(spawnError(err));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(classifyYtdlpError(stderr, ""));
        return;
      }
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
    });
  });
}

export async function fetchVideoMetadataYtdlp(url: string): Promise<VideoMetadata> {
  let lastError: unknown;

  const clients = /youtube\.com|youtu\.be/i.test(url) ? youtubeClients() : [undefined];

  for (const client of clients) {
    try {
      const args = [...baseArgs(url, client), "--dump-single-json", "--skip-download", url];
      const { stdout } = await runProcess(args, 30_000);

      const data = JSON.parse(stdout.toString("utf8")) as Record<string, unknown>;
      const duration = typeof data.duration === "number" ? data.duration : 0;
      if (duration <= 0) throw new YtdlpError("Не удалось определить длительность", "unknown");
      if (duration > MAX_DURATION_SEC) {
        throw new YtdlpError(
          `Видео длиннее ${Math.floor(MAX_DURATION_SEC / 60)} минут`,
          "too_long",
        );
      }

      return {
        title:
          typeof data.title === "string" && data.title.trim() ? data.title.trim() : "audio",
        duration,
        thumbnail:
          typeof data.thumbnail === "string"
            ? data.thumbnail
            : Array.isArray(data.thumbnails) && data.thumbnails.length > 0
              ? String((data.thumbnails[data.thumbnails.length - 1] as { url?: string })?.url ?? "")
              : null,
        platform: mapExtractor(typeof data.extractor === "string" ? data.extractor : undefined),
        uploader:
          typeof data.uploader === "string"
            ? data.uploader
            : typeof data.channel === "string"
              ? data.channel
              : null,
        id: typeof data.id === "string" ? data.id : "unknown",
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new YtdlpError("Не удалось обработать ссылку", "unknown");
}

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  try {
    return await fetchVideoMetadataYtdlp(url);
  } catch (err) {
    if (isYoutubeUrl(url) && shouldUseYoutubeFallback(err)) {
      console.warn("[audio-extractor] yt-dlp failed, trying YouTube fallback:", err);
      return fetchYoutubeMetadataViaFallback(url);
    }
    throw err;
  }
}

export async function streamAudio(url: string): Promise<Response> {
  try {
    return await streamAudioYtdlp(url);
  } catch (err) {
    if (isYoutubeUrl(url) && shouldUseYoutubeFallback(err)) {
      console.warn("[audio-extractor] yt-dlp stream failed, trying YouTube fallback:", err);
      return fetchYoutubeAudioViaFallback(url);
    }
    throw err;
  }
}

function streamAudioYtdlp(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const args = [
      ...baseArgs(url, isVercelRuntime() ? YOUTUBE_CLIENTS[0] : undefined),
      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",
      "-o",
      "-",
      url,
    ];

    let bin: string;
    try {
      bin = resolveYtdlpBinary();
    } catch (err) {
      reject(err);
      return;
    }

    try {
      chmodSync(bin, 0o755);
    } catch {
      /* ignore */
    }

    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let bytesSent = 0;
    let aborted = false;

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on("data", (chunk: Buffer) => {
          if (aborted) return;
          bytesSent += chunk.length;
          if (bytesSent > MAX_STREAM_BYTES) {
            aborted = true;
            child.kill("SIGKILL");
            controller.error(new YtdlpError("Файл слишком большой", "too_long"));
            return;
          }
          controller.enqueue(new Uint8Array(chunk));
        });

        child.stdout.on("end", () => {
          if (!aborted) controller.close();
        });

        child.stdout.on("error", (err) => {
          if (!aborted) controller.error(err);
        });

        child.on("error", (err) => {
          if (!aborted) controller.error(spawnError(err));
        });

        child.on("close", (code) => {
          if (aborted || code === 0) return;
          controller.error(classifyYtdlpError(stderr, ""));
        });
      },
      cancel() {
        aborted = true;
        child.kill("SIGTERM");
      },
    });

    resolve(
      new Response(body, {
        headers: {
          "Content-Type": "audio/mp4",
          "Cache-Control": "no-store",
        },
      }),
    );
  });
}
