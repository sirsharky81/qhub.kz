import { copyFileSync, chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { YtdlpError } from "./ytdlp";

const YTDLP_BIN_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const TMP_BIN =
  process.platform === "win32"
    ? join(process.env.TEMP ?? "C:\\Temp", YTDLP_BIN_NAME)
    : join("/tmp", YTDLP_BIN_NAME);

let cachedBinPath: string | null = null;

function bundledCandidates(): string[] {
  const candidates = new Set<string>();
  candidates.add(join(process.cwd(), "bin", YTDLP_BIN_NAME));
  const initCwd = process.env.INIT_CWD?.trim();
  if (initCwd) candidates.add(join(initCwd, "bin", YTDLP_BIN_NAME));
  return [...candidates];
}

function ensureTmpBinary(source: string): string {
  if (existsSync(TMP_BIN)) return TMP_BIN;
  const dir = join(TMP_BIN, "..");
  mkdirSync(dir, { recursive: true });
  copyFileSync(source, TMP_BIN);
  try {
    chmodSync(TMP_BIN, 0o755);
  } catch {
    /* windows */
  }
  return TMP_BIN;
}

export function resolveYtdlpBinary(): string {
  if (cachedBinPath && existsSync(cachedBinPath)) return cachedBinPath;

  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new YtdlpError("yt-dlp не установлен на сервере", "not_found");
    }
    cachedBinPath = fromEnv;
    return fromEnv;
  }

  for (const candidate of bundledCandidates()) {
    if (!existsSync(candidate)) continue;
    // Vercel/Linux: copy to /tmp for reliable exec permissions.
    cachedBinPath =
      process.platform === "linux" ? ensureTmpBinary(candidate) : candidate;
    try {
      chmodSync(cachedBinPath, 0o755);
    } catch {
      /* ignore */
    }
    return cachedBinPath;
  }

  throw new YtdlpError("yt-dlp не установлен на сервере", "not_found");
}

export function resolveCookiesPath(): string | null {
  const filePath = process.env.YTDLP_COOKIES?.trim();
  if (filePath && existsSync(filePath)) return filePath;

  const b64 = process.env.YTDLP_COOKIES_B64?.trim();
  if (!b64) return null;

  try {
    const content = Buffer.from(b64, "base64").toString("utf8");
    const dest =
      process.platform === "win32"
        ? join(process.env.TEMP ?? "C:\\Temp", "yt-dlp-cookies.txt")
        : join("/tmp", "yt-dlp-cookies.txt");
    writeFileSync(dest, content, "utf8");
    return dest;
  } catch {
    return null;
  }
}
