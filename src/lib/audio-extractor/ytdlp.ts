import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AudioPlatform, VideoMetadata } from "./types";
import { MAX_DURATION_SEC, MAX_STREAM_BYTES } from "./constants";

const YTDLP_BIN_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

function bundledCandidates(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, "bin", YTDLP_BIN_NAME),
    join(cwd, ".next", "server", "bin", YTDLP_BIN_NAME),
  ];
}

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

export function getYtdlpPath(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) return fromEnv;

  for (const candidate of bundledCandidates()) {
    if (existsSync(candidate)) return candidate;
  }

  return "yt-dlp";
}

function resolveYtdlpPath(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new YtdlpError("yt-dlp не установлен на сервере", "not_found");
    }
    return fromEnv;
  }

  for (const candidate of bundledCandidates()) {
    if (existsSync(candidate)) return candidate;
  }

  throw new YtdlpError("yt-dlp не установлен на сервере", "not_found");
}

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

  if (text.includes("private video") || text.includes("this video is unavailable")) {
    return new YtdlpError("Видео недоступно", "unavailable");
  }
  if (text.includes("video unavailable") || text.includes("not available")) {
    return new YtdlpError("Видео недоступно", "unavailable");
  }
  if (
    text.includes("geo") ||
    text.includes("country") ||
    text.includes("not a bot") ||
    text.includes("confirm you're not") ||
    text.includes("sign in to confirm") ||
    text.includes("cookies") && text.includes("youtube")
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

function baseArgs(url: string): string[] {
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
    args.push(
      "--extractor-args",
      "youtube:player_client=android,web;player_skip=webpage,configs",
    );
  }

  const cookies = process.env.YTDLP_COOKIES?.trim();
  if (cookies && existsSync(cookies)) {
    args.push("--cookies", cookies);
  }
  return args;
}

function runProcess(
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = resolveYtdlpPath();
    } catch (err) {
      reject(err);
      return;
    }

    if (bin.includes(`${join("bin", YTDLP_BIN_NAME)}`) || bin.endsWith(YTDLP_BIN_NAME)) {
      try {
        chmodSync(bin, 0o755);
      } catch {
        /* windows */
      }
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

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  const args = [...baseArgs(url), "--dump-single-json", "--skip-download", url];
  const { stdout } = await runProcess(args, 30_000);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new YtdlpError("Не удалось прочитать метаданные", "unknown");
  }

  const duration = typeof data.duration === "number" ? data.duration : 0;
  if (duration <= 0) {
    throw new YtdlpError("Не удалось определить длительность", "unknown");
  }
  if (duration > MAX_DURATION_SEC) {
    throw new YtdlpError(
      `Видео длиннее ${Math.floor(MAX_DURATION_SEC / 60)} минут`,
      "too_long",
    );
  }

  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "audio";
  const id = typeof data.id === "string" ? data.id : "unknown";
  const thumbnail =
    typeof data.thumbnail === "string"
      ? data.thumbnail
      : Array.isArray(data.thumbnails) && data.thumbnails.length > 0
        ? String((data.thumbnails[data.thumbnails.length - 1] as { url?: string })?.url ?? "")
        : null;
  const uploader =
    typeof data.uploader === "string"
      ? data.uploader
      : typeof data.channel === "string"
        ? data.channel
        : null;

  return {
    title,
    duration,
    thumbnail,
    platform: mapExtractor(typeof data.extractor === "string" ? data.extractor : undefined),
    uploader,
    id,
  };
}

export function spawnAudioStream(url: string): {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  abort: () => void;
} {
  const args = [
    ...baseArgs(url),
    "-f",
    "bestaudio[ext=m4a]/bestaudio/best",
    "-o",
    "-",
    url,
  ];

  let bin: string;
  try {
    bin = resolveYtdlpPath();
  } catch (err) {
    throw err;
  }

  if (bin.includes(`${join("bin", YTDLP_BIN_NAME)}`) || bin.endsWith(YTDLP_BIN_NAME)) {
    try {
      chmodSync(bin, 0o755);
    } catch {
      /* windows */
    }
  }

  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  let bytesSent = 0;
  let aborted = false;

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const stream = new ReadableStream<Uint8Array>({
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

  return {
    stream,
    contentType: "audio/mp4",
    abort: () => {
      aborted = true;
      child.kill("SIGTERM");
    },
  };
}
